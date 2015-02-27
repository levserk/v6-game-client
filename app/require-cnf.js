define(function() {
    require.config({
       // urlArgs: 'bust=' + (+new Date()),
        baseUrl: './',
        paths: {
            jquery: 'lib/jquery-2.1.1.min',
            underscore: 'lib/underscore-min',
            backbone: 'lib/backbone-min',
            text: 'lib/text',
            tpls: 'templates',
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