import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

/**
 * Initialization data for the jpfiddle-extension extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jpfiddle-extension:plugin',
  description: 'A JupyterLab extension for jpfiddle.',
  autoStart: true,
  requires: [],
  activate: (app: JupyterFrontEnd) => {
    console.log('JupyterLab extension jpfiddle-extension is activated!');
    if (!window.parent) {
      console.error('No parent window found for jpfiddle-extension');
      return;
    }
    let fiddleId: string | undefined = undefined;

    app.serviceManager.contents.fileChanged.connect(async (sender, change) => {
      console.info('File changed:', change);
      if (!fiddleId) {
        console.error('No fiddleId found in fileChanged event');
        return;
      }
      if (change.type === 'save' && change.newValue) {
        // ignore if it's a directory
        if (change.newValue.type === 'directory') {
          return;
        }
        const fullPath = change.newValue.path;
        if (!fullPath) {
          console.warn('No file path found in fileChanged event');
          return;
        }
        if (!fullPath.startsWith(fiddleId + '/')) {
          console.warn('File path does not start with fiddleId:', fullPath, fiddleId);
          return;
        }
        const path = fullPath.slice(fiddleId.length + 1);
        console.log('File saved:', path, change);
        const vv = await app.serviceManager.contents.get(fullPath);
        window.parent.postMessage(
          {
            type: 'file-saved',
            path,
            content: vv.content
          },
          '*'
        );
      } else if (change.type === 'delete' && change.oldValue) {
        const fullPath = change.oldValue.path;
        if (!fullPath) {
          console.warn('No file path found in fileChanged event');
          return;
        }
        if (!fullPath.startsWith(fiddleId + '/')) {
          console.warn('File path does not start with fiddleId:', fullPath, fiddleId);
          return;
        }
        const path = fullPath.slice(fiddleId.length + 1);
        console.log('File deleted:', path, change);
        window.parent.postMessage(
          {
            type: 'file-deleted',
            path: change.oldValue.path
          },
          '*'
        );
      } else if (
        change.type === 'rename' &&
        change.oldValue &&
        change.newValue
      ) {
        const oldFullPath = change.oldValue.path;
        const newFullPath = change.newValue.path;
        if (!oldFullPath || !newFullPath) {
          console.warn('No file path found in fileChanged event');
          return;
        }
        if (
          !oldFullPath.startsWith(fiddleId + '/') ||
          !newFullPath.startsWith(fiddleId + '/')
        ) {
          console.warn('File path does not start with fiddleId:', oldFullPath, newFullPath, fiddleId);
          return;
        }
        const oldPath = oldFullPath.slice(fiddleId.length + 1);
        const newPath = newFullPath.slice(fiddleId.length + 1);
        console.log('File renamed:', oldPath, newPath, change);
        window.parent.postMessage(
          {
            type: 'file-renamed',
            oldPath,
            newPath
          },
          '*'
        );
      } else if (change.type === 'new' && change.newValue) {
        const fullPath = change.newValue.path;
        if (!fullPath) {
          console.warn('No file path found in fileChanged event');
          return;
        }
        if (!fullPath.startsWith(fiddleId + '/')) {
          console.warn('File path does not start with fiddleId:', fullPath, fiddleId);
          return;
        }
        const path = fullPath.slice(fiddleId.length + 1);
        window.parent.postMessage(
          {
            type: 'file-created',
            path
          },
          '*'
        );
      } else {
        console.warn(`Unknown change type: ${change.type}`)
      }
    });

    const changeToFiddleDirectory = async () => {
      if (!fiddleId) {
        console.error('No fiddleId found in changeToFiddleDirectory');
        return;
      }
      // the command to go-to-path is not available immediately
      // we need to wait until the file browser is ready
      // so we will retry every 0.1 seconds for 10 seconds
      for (let i = 0; i < 100; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (app.commands.hasCommand('filebrowser:go-to-path')) {
          break;
        }
      }
      if (!app.commands.hasCommand('filebrowser:go-to-path')) {
        console.error('Command filebrowser:go-to-path not found');
        return;
      }
      await app.commands.execute('filebrowser:go-to-path', { path: fiddleId });
    }

    const closeAllTabs = async () => {
      // wait until this command is available
      for (let i = 0; i < 100; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (app.commands.hasCommand('application:close-all')) {
          break;
        }
      }
      if (!app.commands.hasCommand('application:close-all')) {
        console.error('Command application:close-all not found');
        return;
      }
      await app.commands.execute('application:close-all');
    }

    const postFilesToParent = async () => {
      if (!fiddleId) {
        console.error('No fiddleId found in get-files event');
        return;
      }
      // check whether directory exists
      try {
        await app.serviceManager.contents.get(fiddleId);
      } catch (error) {
        window.parent.postMessage({ type: 'files', files: null }, '*');
        return
      }
      console.log('Getting files in directory:', fiddleId);
      const getFilesInDirectory = async (path: string): Promise<{path: string, content: string}[]> => {
        const files: {path: string, content: string}[] = [];
        const a = await app.serviceManager.contents.get(path);
        if (a) {
          for (const file of a.content) {
            if (file.type === 'directory') {
              files.push(...(await getFilesInDirectory(file.path)));
            } else {
              if (!isTextFilePath(file.path)) {
                console.log('Ignoring non-text file:', file.path);
                continue;
              }
              const content = (await app.serviceManager.contents.get(file.path)).content;
              files.push({ path: file.path, content });
            }
          }
        }
        return files;
      }
      let files: {path: string, content: string}[] = await getFilesInDirectory(fiddleId)
      console.log('Sending files:', files);
      const files2 = files.map(f => ({ path: f.path.slice((fiddleId || '').length + 1), content: f.content }));
      window.parent.postMessage({ type: 'files', files: files2 }, '*');
    }

    /* Incoming messages management */
    window.addEventListener('message', async event => {
      const msg = event.data;
      console.log('Message received in the iframe:', msg);
      if (msg.type === 'set-fiddle-id') {
        fiddleId = msg.fiddleId;
        if (!fiddleId) return;

        changeToFiddleDirectory();
      }
      else if (msg.type === 'set-files') {
        if (!fiddleId) {
          console.error('No fiddleId found in set-files event');
          return;
        }
        const files = event.data.files;
        for (const file of files) {
          const path = fiddleId + '/' + file.path;
          if (path.split('/').length > 1) {
            await ensureDirectoryExists(app, path.split('/').slice(0, -1).join('/'));
          }
          if (file.content !== null) {
            console.log('saving file', path);
            await app.serviceManager.contents.save(path, {
              type: 'file',
              format: 'text',
              name: file.path,
              content: file.content
            });
          } else {
            try {
              console.log('deleting file', path);
              await app.serviceManager.contents.delete(path);
            }
            catch {
              console.error('Could not delete file', path);
            }
          }
        }
        // maybe the fiddle directory didn't exist before
        // so let's go ahead and change to it now
        changeToFiddleDirectory();
        closeAllTabs();

        // send updated list of files
        postFilesToParent()
      }
      else if (msg.type === 'get-files') {
        postFilesToParent();
      }
    });

    window.parent.postMessage({ type: 'jpfiddle-extension-ready' }, '*');
  }
};

async function ensureDirectoryExists(app: JupyterFrontEnd, path: string) {
  const parts = path.split('/');
  let currentPath = '';
  for (const part of parts) {
    currentPath = currentPath ? currentPath + '/' + part : part;
    try {
      await app.serviceManager.contents.get(currentPath);
    } catch (error) {
      console.log('Creating directory:', currentPath);
      await app.serviceManager.contents.save(currentPath, {
        type: 'directory',
        name: currentPath
      })
    }
  }
}

const isTextFilePath = (path: string) => {
  const extensions = [
    '.ipynb',
    '.py',
    '.md',
    '.txt',
    '.csv',
    '.json',
    '.html',
    '.js',
    '.css',
    '.ts',
    '.tsx',
    '.r',
    '.rmd',
    '.xml',
    '.yaml',
    '.yml',
    '.toml',
    '.ini',
    '.cfg',
    '.conf',
    '.properties',
    '.env',
    '.sh',
    '.bat',
    '.cmd',
  ]
  return extensions.some(ext => path.endsWith(ext));
}

export default plugin;
