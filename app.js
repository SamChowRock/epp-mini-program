const { createClient } = require("./client");
App({
  onLaunch() {
    this.client = createClient(wx, require("./config"));
  },
});
