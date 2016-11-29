var gulp = require('gulp');
var istanbul = require('gulp-istanbul');
var mocha = require('gulp-mocha');

gulp.task('test', function (cb) {
  gulp.src(['./test/index.js'])
    .pipe(mocha({
        bail: true,
        timeout: 2000,
        useColors: true,
        fullTrace: false,
        reporter: 'dot'
    }))
    .on('end', cb);
});

gulp.task('test-coverage', function (cb) {
  gulp.src(['./lib/**/*.js'])
    .pipe(istanbul())
    .pipe(istanbul.hookRequire())
    .on('finish', function () {
      gulp.src(['./test/index.js'])
        .pipe(mocha({
            bail: true,
            timeout: 2000,
            useColors: true,
            fullTrace: false,
            reporter: 'dot'
        }))
        .pipe(istanbul.writeReports())
        .on('end', cb);
    });
});
