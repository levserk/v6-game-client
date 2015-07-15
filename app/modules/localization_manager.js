define(['EE', 'text!localization/ru.JSON', 'text!localization/en.JSON'],
function(EE, RU, EN) {
    'use strict';

    var LocalizationManager = function(client) {
        this.client = client;

        this.localization = localization;

        if (typeof this.client.lang != 'string') this.client.lang = false;

        this.client.lang = this.initLanguage();
        console.log('localization_manager;', 'lang', this.client.lang);
        this.client.locale = this.initLocalization();
        console.log('localization_manager;', 'locale', this.client.locale);
    };

    LocalizationManager.prototype.initLanguage = function(){
        // get client language or ru default
        var navigator = window.navigator,
            lang = this.client.lang || (navigator.languages ? navigator.languages[0] : (navigator.language || navigator.userLanguage)) || 'ru';
        try {
            lang = lang.substr(0,2).toLocaleLowerCase();
        } catch (e) {
            console.error('localization_manager;', 'initLanguage', e)
        }
        if (typeof lang != 'string' || lang.length != 2) lang = 'ru';
        return lang
    };

    LocalizationManager.prototype.initLocalization = function(){
        // init client lang locale or en default
        this.localization['ru'] = JSON.parse(RU);
        this.localization['en'] = JSON.parse(EN);
        this.localization = $.extend(true, this.localization, this.client.opts.localization);
        var locale = this.localization[this.client.lang] || this.localization['en'];
        locale = $.extend(true, {}, this.localization[this.localization.default], locale);
        locale.get = localization._get;
        return locale;
    };

    var localization = {
        "default": 'ru',
        "_get": function(desc) {
            var arr = desc.split("."),
                obj = this;
            while(arr.length && (obj = obj[arr.shift()]));
            return obj;
        }
    };

    return LocalizationManager;
});