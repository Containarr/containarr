import { WebSocket, WebSocketServer } from 'ws';

import Docker from '../../services/Docker.mjs';

export default class ContainerShell {

  constructor(server) {
    this.webSockets = new WebSocketServer({ noServer: true });
    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url, 'http://localhost');
      const match = url.pathname.match(/^\/api\/v1\/container\/([^/]+)\/shell$/);
      if (!match) {
        socket.destroy();
        return;
      }

      this.webSockets.handleUpgrade(request, socket, head, webSocket => {
        this.open(webSocket, decodeURIComponent(match[1]));
      });
    });
  }

  async open(webSocket, containerId) {
    let shell = null;
    let closed = false;
    const send = message => {
      if (webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(JSON.stringify(message));
      }
    };
    const close = (notifyExit = true) => {
      if (closed) return;
      closed = true;
      if (notifyExit) send({ type: 'exit' });
      webSocket.close();
    };

    webSocket.on('message', message => {
      if (!shell) return;

      try {
        const event = JSON.parse(message.toString());
        if (event.type === 'input' && typeof event.data === 'string') {
          shell.write(event.data);
        }
        if (
          event.type === 'resize'
          && Number.isInteger(event.columns)
          && Number.isInteger(event.rows)
        ) {
          shell.resize({
            columns: Math.max(1, event.columns),
            rows: Math.max(1, event.rows),
          }).catch(error => send({ type: 'error', message: error.message }));
        }
      } catch (error) {
        send({ type: 'error', message: error.message });
      }
    });
    webSocket.on('close', () => {
      closed = true;
      shell?.close();
    });

    try {
      shell = await Docker.createContainerShell({
        containerId,
        onData: data => send({ type: 'output', data }),
        onClose: close,
        onError: error => {
          send({ type: 'error', message: error.message });
          close(false);
        },
      });
      send({ type: 'ready' });
    } catch (error) {
      send({ type: 'error', message: error.message });
      close(false);
    }
  }
}
