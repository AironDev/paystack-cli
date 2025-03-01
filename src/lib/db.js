const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')

const adapter = new FileSync('db.json')
const db = low(adapter)

// eslint-disable-next-line camelcase
db.defaults({token: '', user: {}, selected_integration: {}}).write()

module.exports = {
  write: function (key, value) {
    db.set(key, value).write()
  },
  read: function (key) {
    return db.get(key).value()
  },
  addToList: function (key, value) {
    db.get(key)
    .push(value)
    .write()
  },
  query: function (key, query) {
    return db.get(key)
    .find(query).value()
  },
  clear() {
    db.assign({ token: '', user: {}, selected_integration: {}, token_expiry: null }).write();
  }
}
