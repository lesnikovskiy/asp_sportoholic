/// <binding BeforeBuild='build' Clean='clean' />
"use strict";

var gulp = require("gulp");
var rimraf = require("rimraf");
var concat = require("gulp-concat");
var cssmin = require("gulp-cssmin");
var uglify = require("gulp-uglify");
var rename = require("gulp-rename");
var browserify = require("browserify");
var stringify = require("stringify");
var babelify = require("babelify");
var source = require("vinyl-source-stream");

var paths = {
	webroot: "./wwwroot/"
};

paths.js = paths.webroot + "js/**/*.js";
paths.html = paths.webroot + "**/*.html";

paths.cssRoot = paths.webroot + "css";
paths.css = paths.webroot + "css/**/*.css";
paths.minCss = paths.webroot + "css/**/*.min.css";

paths.bundlesDir = paths.webroot + "js/bundles/";
paths.bundle = paths.bundlesDir + "bundle.js";
paths.bundleMinJs = paths.bundlesDir + "bundle.min.js";
paths.entryPoint = paths.webroot + "js/App.js";

gulp.task("clean:js", function(cb) {
	rimraf(paths.bundlesDir + "**/*.js", cb);
});

gulp.task("clean", ["clean:js"]);

gulp.task("min:js", function() {
	return gulp.src(paths.bundlesDir + "**/*.js")
		.pipe(uglify())
		.pipe(rename({ extname: ".min.js" }))
		.pipe(gulp.dest(paths.bundlesDir));
});

gulp.task("min:css", function() {
	return gulp.src(paths.css)
		.pipe(cssmin())
		.pipe(rename({extname:".min.css"}))
		.pipe(gulp.dest(paths.cssRoot));
});

gulp.task("min", ["min:js", "min:css"]);

gulp.task("build", function () {
	return browserify({ entries: paths.entryPoint })
		.transform(stringify([".html"]))
		.transform("babelify", { presets: ["es2015"] })
		.bundle()
		.pipe(source("bundle.js"))
		.pipe(gulp.dest(paths.bundlesDir));
});

gulp.task("watch", function () {
	var watcher = gulp.watch([paths.js, paths.html], ["build"]);
	watcher.on("change", function (event) {
		console.log("File " + event.path + " was " + event.type + ", running tasks ...");
	});
});