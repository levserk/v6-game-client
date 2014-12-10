define(function() {
    require.config({
        baseUrl: 'js',
        urlArgs: 'bust=' + (+new Date()),
        paths: {
            jquery: 'lib/jquery-2.1.1.min',
            underscore: 'lib/underscore-min',
            backbone: 'lib/backbone-min',
            text: 'lib/text',
            tpls: '../tpl',
            client: 'modules/client',
            EE: 'lib/EventEmitter.min',
            'jquery-ui': 'lib/jquery-ui'
        },
        shim: {
            backbone: {
                deps: ['underscore', 'jquery'],
                exports: 'Backbone'
            },
            'jquery-ui': {
                exports: "$",
                deps: ['jquery']
            },
            EE: {
                exports: 'EventEmitter'
            }
        }
    });
});