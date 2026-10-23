const app = require('../backend-api/app');

function printRoutes(stack, prefix = '') {
  stack.forEach(middleware => {
    if (middleware.route) {
      const methods = Object.keys(middleware.route.methods).join(',').toUpperCase();
      console.log(`${methods} ${prefix}${middleware.route.path}`);
    } else if (middleware.name === 'router' && middleware.handle.stack) {
      let nextPrefix = prefix;
      if (middleware.regexp) {
        const match = middleware.regexp.source
          .replace('^\\', '')
          .replace('\\/?(?=\\/|$)', '')
          .replace(/\\\//g, '/')
          .replace(/\^/g, '')
          .replace(/\$/g, '');
        nextPrefix = prefix + match;
      }
      printRoutes(middleware.handle.stack, nextPrefix);
    }
  });
}

console.log('--- Express Routes ---');
printRoutes(app._router.stack);
