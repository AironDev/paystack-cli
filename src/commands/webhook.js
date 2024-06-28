/* eslint-disable no-unused-vars */
/* eslint-disable block-scoped-var */
/* eslint-disable no-redeclare */
/* eslint-disable camelcase */
const { Command, Flags, CliUx } = require('@oclif/core');
const ngrok = require('ngrok');
const chalk = require('chalk');
const helpers = require('../lib/helpers');
const Paystack = require('../lib/paystack');
const db = require('../lib/db');

// Function to decode base64
function base64ToString(base64) {
  return Buffer.from(base64, 'base64').toString('utf8');
}

// Function to get webhook message (this function should be defined by you)
function getWebhookMessage(requestBody) {
  // Implement your logic to generate a webhook message
  return "Webhook message";
}

// Webhook inspector function
async function webhookInspector(ngrokApi, tunnel) {
  let id = '';
  const fetch = (await import('node-fetch')).default;
  setInterval(async () => {
    try {
      CliUx.ux.action.start('.');
      const httpRequestsResponse = await fetch(`http://127.0.0.1:4040/api/requests/http?tunnel_name=${tunnel.name}`);
      const httpRequests = await httpRequestsResponse.json();
      if (httpRequests.requests.length === 0) {
        return;
      }
      let lastRequest = httpRequests.requests[0];
      if (lastRequest.id === id) {
        return;
      }
      id = lastRequest.id;
      let requestBody = base64ToString(lastRequest.request.raw);
      requestBody = requestBody.slice(requestBody.indexOf('{"eve'));
      requestBody = JSON.parse(requestBody);
      let responseCode = lastRequest.response.status_code.toString();
      let webhookDescription = getWebhookMessage(requestBody);
      let responseMessage = `${responseCode} ${lastRequest.response.status} - ${requestBody.event} - ${webhookDescription}`;
      if (!responseCode.startsWith('2')) {
        responseMessage = chalk.red(responseMessage);
      }
      console.log(responseMessage);
      console.log(base64ToString(lastRequest.response.raw));
      console.log('----------------------------------------------');
    } catch (error) {
      console.error(`Error fetching or processing HTTP requests: ${error.message}`);
    } finally {
      CliUx.ux.action.stop();
    }
  }, 5000);
}

class WebhookCommand extends Command {
  async run() {
    let selected_integration = db.read('selected_integration.id');
    let user = db.read('user.id');
    if (!selected_integration || !user) {
      this.error("You're not signed in, please run the `login` command before you begin");
    }
    const { args, flags } = await this.parse(WebhookCommand);
    switch (args.subcommand) {
      case 'listen': {
        let token = '';
        let expiry = parseInt(db.read('token_expiry'), 10) * 1000;
        let now = parseFloat(Date.now().toString());

        if (expiry > now) {
          token = db.read('token');
        } else {
          await helpers.promiseWrapper(Paystack.refreshIntegration());
          token = db.read('token');
        }

        if (!flags.forward) {
          this.error('To listen to webhook events locally, you have to specify a local route to forward events to using the forward flag e.g --forward localhost:3000/webhook');
        }
        let urlObject = helpers.parseURL(flags.forward);

        if (!urlObject.port) {
          urlObject.port = 8080;
        }
        if (!urlObject.search || urlObject.search === '?') {
          urlObject.search = '';
        }
        try {
          await ngrok.disconnect();
        } catch (error) {
          this.error(error);
        }
        let ngrokHost = await ngrok.connect(urlObject.port);
        let ngrokURL = ngrokHost + urlObject.pathname + urlObject.search;
        let domain = 'test';
        if (flags.domain === 'live') {
          domain = 'live';
        }
        console.log('tunnel', ngrokURL);
        let originalWebhookUrl = db.read('selected_integration.' + domain + '_webhook_endpoint');
        helpers.infoLog(`Forwarding webhook events to ${flags.forward}`);

        // eslint-disable-next-line no-unused-vars
        var [err, result] = await helpers.promiseWrapper(Paystack.setWebhook(ngrokURL, token, db.read('selected_integration.id'), domain));
        if (err) {
          this.error(err);
        }
        this.log('Webhook events would now be forwarded to ' + flags.forward);

        // Getting tunnels using ngrok API endpoint directly
        const fetch = (await import('node-fetch')).default;
        const tunnelsResponse = await fetch('http://127.0.0.1:4040/api/tunnels');
        const tunnelsData = await tunnelsResponse.json();
        const tunnels = tunnelsData.tunnels;

        let tunnel;
        for (let i = 0; i < tunnels.length; i++) {
          if (tunnels[i].public_url === ngrokHost) {
            tunnel = tunnels[i];
          }
        }

        if (process.platform === 'win32') {
          var rl = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          rl.on('SIGINT', function () {
            process.emit('SIGINT');
          });
        }
        process.on('SIGINT', async () => {
          // graceful shutdown
          this.log('cleaning up ');
          var [err, result] = await helpers.promiseWrapper(Paystack.setWebhook(originalWebhookUrl, token, db.read('selected_integration.id'), domain));
          if (err) {
            this.error(err);
          }
          // eslint-disable-next-line no-process-exit
          process.exit();
        });
        webhookInspector(fetch, tunnel); // Pass fetch and tunnel to webhookInspector
        break;
      }
      case 'ping': {
        await helpers.promiseWrapper(Paystack.refreshIntegration());
        // eslint-disable-next-line no-unused-vars
        var [e, response] = await helpers.promiseWrapper(Paystack.pingWebhook(flags));
        helpers.infoLog('-  - - - - WEBHOOK RESPONSE - - - -  - -');
        helpers.infoLog(response.code + ' - - ' + response.text);
        if (helpers.isJson(response.data)) {
          helpers.jsonLog(response.data);
        } else {
          helpers.infoLog(response.data);
        }
        break;
      }
    }
  }
}

WebhookCommand.description = 'Listen for webhook events locally, and ping your webhook URL from the CLI';
WebhookCommand.args = [
  { name: 'subcommand' },
];

WebhookCommand.flags = {
  forward: Flags.string(),
  domain: Flags.string(),
};

module.exports = WebhookCommand;
