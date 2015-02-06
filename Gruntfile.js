module.exports = function(grunt) {
    grunt.loadNpmTasks('grunt-requirejs');
    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-clean');

    grunt.initConfig({
        pkg: grunt.file.readJSON("package.json"),

        clean: ['build/'],

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
        },
        copy: {
            main: {
                files: [
                    {expand: false, src: 'build/v6-game-client.css', dest: 'build/v6-game-client.<%= pkg.version %>.css', filter: 'isFile'},
                    {expand: false, src: 'build/v6-game-client.js', dest: 'build/v6-game-client.<%= pkg.version %>.js', filter: 'isFile'},
                    {expand: false, src: 'build/v6-game-client.req.js', dest: 'build/v6-game-client.req.<%= pkg.version %>.js', filter: 'isFile'},
                    {expand: false, src: 'build/v6-game-client.min.js', dest: 'build/v6-game-client.<%= pkg.version %>.min.js', filter: 'isFile'},
                    {expand: false, src: 'build/v6-game-client.req.min.js', dest: 'build/v6-game-client.req.<%= pkg.version %>.min.js', filter: 'isFile'}
                ]
            }
        }
    });

    grunt.registerTask('default', ['clean', 'requirejs', 'cssmin', 'uglify', 'copy']);
};