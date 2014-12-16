module.exports = function(grunt) {
    grunt.loadNpmTasks('grunt-requirejs');
    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.loadNpmTasks('grunt-contrib-uglify');

    grunt.initConfig({
        cssmin: {
            options: {
                banner: '/*! v6-game-client <%= grunt.template.today("yyyy-mm-dd HH:MM") %> */'
            },
            combine: {
                files: {
                    'build/v6-game-client.css': ['app/css/*']
                }
            }
        },

        uglify:{
            options: {
                banner: '/*! v6-game-client <%= grunt.template.today("yyyy-mm-dd HH:MM") %> */\n'
            },
            js: {
                files: {
                    'build/v6-game-client.min.js': 'build/v6-game-client.js',
                    'build/v6-game-client.req.min.js': 'build/v6-game-client.req.js'
                }
            }
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
                            "underscore",
                            "require-cnf.js"
                        ],
                        wrap: {
                            startFile: 'wrap.start',
                            endFile: 'wrap.end'
                        },
                        out: 'build/v6-game-client.js'
                    }
                },
            compileForProduction: {
                    options: {
                        mainConfigFile: 'app/require-cnf.js',
                        baseUrl: 'app',
                        include: ['v6-game-client'],
                        findNestedDependencies: true,
                        optimize: 'none',
                        exclude: [
                            "backbone",
                            "jquery",
                            "jquery-ui",
                            "underscore",
                            'EE',
                            'lib/text.js'
                        ],
                        wrap: false,
                        out: 'build/v6-game-client.req.js'
                    }
            }

        }
    });

    grunt.registerTask('default', ['requirejs', 'cssmin', 'uglify']);
};