const gulp = require('gulp');
const sourcemaps = require('gulp-sourcemaps');
const browserSync = require('browser-sync').create();

const paths = {
  globalStyles: 'master/public/src/css/*.css',
  viewStyles: 'master/public/src/css/views/*.css',
  lintedscripts: ['device/*.js', '!device/program.js'],
  globalTs: 'master/public/src/ts/*.ts',
  viewTs: 'master/public/src/ts/views/*.ts',
  definitionTs: 'master/public/src/ts/definitions/*.d.ts',
  markdown: 'Doc/**/*.md',
  markdownTarget: 'Doc/html/',
  otherJs: 'master/public/js/jumpCard-src.js',
};

gulp.task('lint:js', () => {
  const eslint = require('gulp-eslint');
  return gulp.src(paths.lintedscripts)
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failAfterError());
});

gulp.task('lint:ts:global', () => {
  const tslint = require('gulp-tslint');
  const config = require('tslint').findConfiguration();
  config.rulesDirectory = [];
  return gulp.src(paths.globalTs)
    .pipe(tslint({
      configuration: config,
      rulesDirectory: config.rulesDirectory,
    }))
    .pipe(tslint.report('prose'));
});
gulp.task('lint:ts:views', () => {
  const tslint = require('gulp-tslint');
  const config = require('tslint').findConfiguration();
  config.rulesDirectory = [];
  return gulp.src(paths.viewTs)
    .pipe(tslint({
      configuration: config,
      rulesDirectory: config.rulesDirectory,
    }))
    .pipe(tslint.report('prose'));
});
gulp.task('lint:ts', ['lint:ts:global', 'lint:ts:views']);

gulp.task('lint', ['lint:js', 'lint:ts']);

gulp.task('browser-sync', () => {
  browserSync.init({
    proxy: 'http://localhost:400',
  });
  gulp.watch('master/public/*.html').on('change', browserSync.reload);
});

gulp.task('browser-sync:reload', () => {
  browserSync.reload();
});

gulp.task('css:global', () => {
  const postcss = require('gulp-postcss');
  const concat = require('gulp-concat');
  return gulp.src(paths.globalStyles)
  .pipe(sourcemaps.init())
  .pipe(postcss([require('autoprefixer'), require('precss')]))
  .pipe(concat('style.css'))
  .pipe(sourcemaps.write('../maps'))
  .pipe(gulp.dest('master/public/css'))
  .pipe(browserSync.stream());
});
gulp.task('css:views', () => {
  const postcss = require('gulp-postcss');
  return gulp.src(paths.viewStyles)
  .pipe(sourcemaps.init())
  .pipe(postcss([require('autoprefixer'), require('precss')]))
  .pipe(sourcemaps.write('../../maps'))
  .pipe(gulp.dest('master/public/css'))
  .pipe(browserSync.stream());
});
gulp.task('css', ['css:global', 'css:views']);

gulp.task('ts:global', ['lint:ts:global'], () => {
  const ts = require('gulp-typescript');
  const babel = require('gulp-babel');
  const merge = require('merge2');
  const tsresult = gulp.src(paths.globalTs)
    .pipe(sourcemaps.init())
    .pipe(ts({
      noImplicitAny: true,
      removeComments: true,
      preserveConstEnums: true,
      module: 'commonjs',
      target: 'es6',
      out: 'hawpey.js',
      declaration: true,
      noExternalResolve: true,
    }));
  return merge([
    tsresult.dts.pipe(gulp.dest('master/public/src/ts/definitions')),
    tsresult.js
      .pipe(babel({
        presets: ['es2015'],
      }))
      .pipe(sourcemaps.write('../maps'))
      .pipe(gulp.dest('master/public/js')),
  ]);
});
gulp.task('ts:views', ['lint:ts:views'], () => {
  const ts = require('gulp-typescript');
  const babel = require('gulp-babel');
  const glob = require('glob');
  const path = require('path');
  const merge = require('merge2');
  const tasks = glob.sync(paths.viewTs).map(file =>
    gulp.src([paths.definitionTs, file])
      .pipe(sourcemaps.init())
      .pipe(ts({
        noImplicitAny: true,
        removeComments: true,
        preserveConstEnums: true,
        module: 'commonjs',
        target: 'es6',
        out: `${path.basename(file, '.ts')}.js`,
      }))
      .pipe(babel({
        presets: ['es2015'],
      }))
      .pipe(sourcemaps.write('../maps'))
      .pipe(gulp.dest('master/public/js'))
  );
  return merge(tasks);
});
gulp.task('ts', ['ts:global', 'ts:views']);

gulp.task('js:other', () => {
  const babel = require('gulp-babel');
  const rename = require('gulp-rename');
  return gulp.src(paths.otherJs)
    .pipe(babel({
      presets: ['es2015'],
    }))
    .pipe(rename('jumpCard.js'))
    .pipe(gulp.dest('master/public/js/'));
});

const capitalize = (s) => s.charAt(0).toUpperCase() + s.substring(1);

function generateSideBar(dir) {
  const fs = require('fs');
  const path = require('path');

  const dirAbs = `${__dirname}/${dir}`;

  const walk = (directoryName) => {
    return new Promise(resolve => {
      fs.readdir(directoryName, (e, files) => {
        if (e) throw e;
        Promise.all(files.map(file => {
          const fullPath = path.join(directoryName, file);
          return new Promise(r => {
            fs.stat(fullPath, (e2, f) => {
              if (e2) throw e2;
              if (f.isDirectory()) {
                if (file !== 'html') {
                  return walk(fullPath).then(html => {
                    r(`<li class="folder"><a>${capitalize(path.basename(file, '.md'))}</a>${html}</li>`);
                  });
                }
                return new Promise(() => r(''));
              }
              return new Promise(() => {
                const atarget = path.relative(dirAbs, fullPath)
                  .replace(/.md$/, '')
                  .replace(/\\/g, '/')
                  .replace(/README$/, '');
                const aname = path.basename(file, '.md');
                r(`<li class="file"><a href="/doc/${atarget}">${capitalize(aname)}</a></li>`);
              });
            });
          });
        })).then(results => {
          resolve(`<ul>${results.join('')}</ul>`);
        });
      });
    });
  };
  return walk(dirAbs)
    .then(html => `<header>${html.replace('ul>', 'ul class="side-nav fixed"><li class="icon"><a href="/doc"><img src="/doc/icon.svg" /></a></li>')}</header>`);
}

gulp.task('markdown', () => {
  const marked = require('gulp-marked');
  const wrapper = require('gulp-wrapper');
  const path = require('path');

  generateSideBar('Doc').then(sidebar => {
    gulp.src(paths.markdown)
    .pipe(marked({
      highlight: (code, lang, callback) => {
        require('pygmentize-bundled')({ lang, format: 'html' }, code, (err, result) => {
          const r = result.toString();
          callback(err, r.substring(28, r.length - 14)); // Gets rid of pre
        });
      },
      renderer: {
        heading: (text, level) => {
          const escapedText = text.toLowerCase().replace(/[^\w]+/g, '-');
          return `<h${level}>
            <a name="${escapedText}" class="anchor" href="#${escapedText}">
              <svg fill="#000000" height="24" viewBox="0 0 24 24" width="24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
            </a>${text}
          </h${level}>`;
        },
      },
    }))
    .pipe(wrapper({
      header: (file) => {
        const p = path.relative(`${__dirname}/Doc`, file.path)
          .replace(/.html$/, '').replace(/\\/g, '/');
        const p2 = p.replace(/README$/, '');
        let title = ` | ${capitalize(p2.replace(/^\/doc/, '').replace(/\/$/, ''))}`;
        if (title === ' | ') title = '';
        return `<!DOCTYPE html><html><head>
          <title>Hawpey Docs${title}</title>
          <link href="/doc/materialize.css" type="text/css" rel="stylesheet" />
          <meta name="viewport" content="width=device-width, initial-scale=1">
          </head><body>
          ${sidebar.replace(`<li class="file"><a href="/doc/${p2}"`,
          `<li class="file selected"><a href="/doc/${p2}"`)}
          <main><div class="container">
        `;
      },
      footer: '</div></main></body></html>',
    }))
    .pipe(gulp.dest(paths.markdownTarget));
  });
});

gulp.task('watch:css', () => {
  gulp.watch(paths.globalStyles, ['css:global']);
  gulp.watch(paths.viewStyles, ['css:views']);
});
gulp.task('watch:ts', () => {
  gulp.watch(paths.globalTs, ['ts:global', 'browser-sync:reload']);
  gulp.watch(paths.viewTs, ['ts:views', 'browser-sync:reload']);
});
gulp.task('watch:markdown', () => {
  gulp.watch(paths.markdown, ['markdown']);
});

gulp.task('watch', ['watch:css', 'watch:ts', 'watch:markdown', 'browser-sync']);
gulp.task('default', ['lint', 'css', 'ts']);
