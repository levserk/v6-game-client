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
                    mainConfigFile: 'app/require-cnf.js',
                    baseUrl: 'app',
                    include: ['lib/almond.js','main.js'],
                    findNestedDependencies: true,
                    optimize: 'none',
                    exclude: [
                        "backbone",
                        "jquery",
                        "jquery-ui",
                        "underscore"
                    ],
                    wrap: {
                        startFile: 'wrap.start',
                        endFile: 'wrap.end'
                    },
                    //stubModules:["jquery","jquery-ui", "underscore","backbone"],
                    out: 'build/v6-game-client.js'
                }
            }
        }
    });

    grunt.registerTask('default', ['requirejs']);

//    grunt.registerMultiTask('log', 'Log stuff.', function() {
//        grunt.log.writeln(this.target + ': ' + this.data);
//    });
};