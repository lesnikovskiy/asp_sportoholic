var fs = require('fs');

module.exports = function (grunt) {

	var pkg = grunt.file.readJSON('package.json');

	grunt.initConfig({

		pkg: pkg,

		jshint: {
			options: {
				multistr: true
			},
			all: ['Gruntfile.js', 'src/**/*.js']
		},

		less: {
			prod: {
				options: {
					banner: "/*! ko-calendar.css v" + pkg.version + " */ ",
					compress: true,
					sourcemap: 'none'
				},
				files: {
					'dist/ko-calendar.min.css': ['src/less/ko-calendar.less']
				}
			}
		},

		uglify: {
			prod: {
				options: {
					banner: "/*! ko-calendar.js v" + pkg.version + " */" + "\n",
					preserveComments: 'none'
				},
				files: {
					'dist/ko-calendar.min.js': ['src/js/ko-calendar.js']
				}
			}
		},

		watch: {
			js: {
				files: 'src/**/*.js',
				tasks: ['jshint', 'uglify']
			},
			less: {
				files: 'src/**/*.less',
				tasks: ['less']
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-contrib-less');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-contrib-watch');

	// Register Tasks
	grunt.registerTask('default', ['jshint', 'uglify', 'less']);
	grunt.registerTask('develop', ['jshint', 'uglify', 'less', 'watch']);
};
