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
    window.parent.postMessage({ type: 'jpfiddle-extension-ready' }, '*');

    /* Incoming messages management */
    window.addEventListener('message', event => {
      const msg = event.data;
      console.log('Message received in the iframe ***D:', msg);
      app.serviceManager.contents.fileChanged.connect((sender, change) => {
        if (change.type === 'save' && change.newValue) {
          // ignore if it's a directory
          if (change.newValue.type === 'directory') {
            return;
          }
          console.log(
            'File saved:',
            change.newValue.path
          );
          window.parent.postMessage(
            {
              type: 'file-saved',
              path: change.newValue.path,
              content: change.newValue.content
            },
            '*'
          );
        } else if (change.type === 'delete' && change.oldValue) {
          console.log('File deleted:', change.oldValue.path);
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
          console.log(
            'File renamed:',
            change.oldValue.path,
            change.newValue.path
          );
          window.parent.postMessage(
            {
              type: 'file-renamed',
              oldPath: change.oldValue.path,
              newPath: change.newValue.path
            },
            '*'
          );
        } else if (change.type === 'new' && change.newValue) {
          console.log('New file created:', change.newValue.path);
          window.parent.postMessage(
            {
              type: 'file-created',
              path: change.newValue.path
            },
            '*'
          );
        } else {
          console.warn(`Unknown change type: ${change.type}`)
        }
      });
      if (msg.type === 'set-files') {
        const files = event.data.files;
        for (const file of files) {
          console.log('Creating a new file:', file);
          if (file.path.split('/').length > 1) {
            ensureDirectoryExists(app, file.path.split('/').slice(0, -1).join('/'));
          }
          app.serviceManager.contents.save(file.path, {
            type: 'file',
            format: 'text',
            content: file.content
          });
        }
      }
    });
  }
};

async function ensureDirectoryExists(app: JupyterFrontEnd, path: string) {
  const parts = path.split('/');
  let currentPath = '';
  for (const part of parts) {
    currentPath = currentPath + '/' + part;
    try {
      await app.serviceManager.contents.get(currentPath);
    } catch (error) {
      await app.serviceManager.contents.save(currentPath, {
        type: 'directory'
      })
    }
  }
}

export default plugin;
