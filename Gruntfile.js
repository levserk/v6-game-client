module.exports = function(grunt) {
    grunt.loadNpmTasks('grunt-requirejs');

    grunt.initConfig({
        log: {
            foo: [1, 2, 3],
            bar: 'hello world',
            baz: false
        },
        'usemin-handler': {
            html: 'index.html'
        },
        requirejs: {
            compile: {
                options: {
                    baseUrl: 'js',
                    mainConfigFile: "js/require-cnf.js",
                    out: 'dist/build.min.js',
                    name: 'js/main.js',
                    findNestedDependencies: true,
                    wrap: true,
                    optimize: 'none',
                    exclude: [
                        "lib/jquery-2.1.1.min.js",
                        "lib/jquery-ui.js",
                        "lib/EventEmitter.min.js",
                        "lib/underscore-min.js",
                        "lib/backbone-min.js"
                    ]
                }
            }
        }
    });

    grunt.registerTask('default', ['requirejs']);

//    grunt.registerMultiTask('log', 'Log stuff.', function() {
//        grunt.log.writeln(this.target + ': ' + this.data);
//    });
};