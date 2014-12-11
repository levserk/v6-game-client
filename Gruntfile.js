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
                    wrap: true,
                    optimize: 'none'
                }
            }
        }
    });

    grunt.registerTask('default', ['requirejs']);

//    grunt.registerMultiTask('log', 'Log stuff.', function() {
//        grunt.log.writeln(this.target + ': ' + this.data);
//    });
};