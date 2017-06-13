const fs = require('fs');
const path = require('path');

function walk(dir) {
  fs.readdir(dir, (e, files) => {
    if (e) throw e;
    for (const file of files) {
      const fullPath = path.join(dir, file).replace(/\\/g, '/');
      fs.stat(fullPath, (e2, f) => {
        if (e2) throw e2;
        if (f.isDirectory()) {
          walk(fullPath);
        } else {
          const s = 'scripts/files/';
          const i = fullPath.lastIndexOf(s);
          const replacePath = fullPath.substring(0, i) + fullPath.substring(i + s.length);
          fs.exists(replacePath, (exists) => {
            if (exists) {
              console.log(`Not replaceing ${replacePath} because it already exists`);
            } else {
              fs.createReadStream(fullPath).pipe(fs.createWriteStream(replacePath));
            }
          });
        }
      });
    }
  });
}

walk(`${__dirname}/files`);
