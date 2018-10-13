import { CcgStateOSC } from './casparCGStateOSC';
const express = require('express');

export class App {
    constructor() {
        this.playing = false;
        this.foregroundProducername = 'TEST OF NAME';
        this.setupOscServer();
        this.setupExpressServer();
    }

    setupOscServer() {
        const oscConnection = new CcgStateOSC({ plugin: new CcgStateOSC.WebsocketServerPlugin({ port: 5900 }) });
        oscConnection.connect(); 
        oscConnection.on('', (message) => {
            this.playing = true;
            console.log(message.args);
        });
        console.log(oscConnection);
    }

    setupExpressServer() {
        const server = express();
        const port = 5254;

        server.get('/name', (req, res) => res.send(this.foregroundProducername));
        server.get('/playing', (req, res) => res.send(this.playing));

        server.listen(port, () => console.log(`Example app listening on port ${port}!`));
    }
}