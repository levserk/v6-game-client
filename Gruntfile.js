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
                    mainConfigFile:'app/require-cnf.js',

                    include: ['lib/almond.js','main.js'],
                    findNestedDependencies: true,
                    wrap: true,
                    optimize: 'none',
                    exclude: [
                        //"require-cnf.js",
                        //"backbone"
                    ],
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