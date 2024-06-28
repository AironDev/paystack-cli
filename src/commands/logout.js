/* eslint-disable no-redeclare */
/* eslint-disable camelcase */
/**  global db **/
const {Command} = require('@oclif/core')
const db = require('../lib/db')
const shell = require('shelljs')
if (!shell.which('git')) {
  shell.echo('Sorry, this script requires git')
  shell.exit(1)
}
const helpers = require('../lib/helpers')
const Paystack = require('../lib/paystack')

class LogoutClass extends Command {
  async run() {
    let token = ''
    let e
    let response
    let expiry = parseInt(db.read('token_expiry'), 10) * 1000
    let now = parseFloat(Date.now().toString())
    let user

    db.clear({ token: '', user: {}, selected_integration: {} });
    
  }
}

LogoutClass.description = 'Sign in to the CLI'

module.exports = LogoutClass
