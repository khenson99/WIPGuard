const fetch = require('node-fetch');

async function testApi() {
  try {
    const res = await fetch('http://localhost:3000/api/analytics?domain=ads-meta-ads');
    const data = await res.json();
    console.log(JSON.stringify({
      metaPage: data.metaPage,
      instagram: data.instagram,
      errors: data.errors
    }, null, 2));
  } catch (err) {
    console.error(err);
  }
}

testApi();
