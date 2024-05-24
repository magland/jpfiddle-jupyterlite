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

    /* Incoming messages management */
    window.addEventListener('message', event => {
      const msg = event.data;
      console.log('Message received in the iframe ***D:', msg);
      app.serviceManager.contents.fileChanged.connect((sender, change) => {
        if (change.type === 'save' && change.newValue) {
          console.log(
            'File saved:',
            change.newValue.path,
            change.newValue.content
          );
          window.parent?.postMessage(
            {
              type: 'file-saved',
              path: change.newValue.path,
              content: change.newValue.content
            },
            '*'
          );
        } else if (change.type === 'delete' && change.oldValue) {
          console.log('File deleted:', change.oldValue.path);
          window.parent?.postMessage(
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
          window.parent?.postMessage(
            {
              type: 'file-renamed',
              oldPath: change.oldValue.path,
              newPath: change.newValue.path
            },
            '*'
          );
        } else if (change.type === 'new' && change.newValue) {
          console.log('New file created:', change.newValue.path);
          window.parent?.postMessage(
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
          app.serviceManager.contents.save(file.path, {
            type: 'file',
            format: 'text',
            content: file.content
          });
        }
      } else if (msg.type === 'get-files') {
        const xx = app.serviceManager.contents.get('.');
        console.log('Files:', xx);
        window.postMessage(
          {
            type: 'files'
          },
          '*'
        );
      }
    });
  }
};

export default plugin;
