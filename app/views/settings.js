define(['underscore', 'backbone', 'text!tpls/v6-settingsMain.ejs', 'text!tpls/v6-settingsDefault.ejs'],
    function(_, Backbone, tplMain, tplDefault) {
        'use strict';

        var SettingsView = Backbone.View.extend({
            tagName: 'div',
            id: 'v6-settings',
            tplMain: _.template(tplMain),
            tplDefault: _.template(tplDefault),
            events: {
                'click .closeIcon': 'close',
                'change input': 'changed',
                'click .confirmBtn': 'save'
            },


            initialize: function(client) {
                this.client = client;
                this.images  = client.opts.images;

                this.$el.html(this.tplMain({close:this.images.close, settings: client.opts.settingsTemplate ? _.template(client.opts.settingsTemplate)() : this.tplDefault()}));

                $('body').append(this.$el);
                this.$el.hide();

            },

            changed: function (e){
                var $target = $(e.target),
                    type = $target.prop('type'),
                    property = $target.prop('name'),
                    value = type == "radio" ? $target.val() : $target.prop('checked'),
                    settings = this.client.settings,
                    defaultSettings = this.client.defaultSettings;

                if (defaultSettings.hasOwnProperty(property)){
                    console.log('settings; changed', {property: property, value: value, type: type});
                    if (this.changedProperties.indexOf(property) == -1)this.changedProperties.push(property);
                    this.client._onSettingsChanged({property: property, value: value, type: type});
                } else {
                    console.warn('settings;', 'default settings does not have property', property);
                }
            },

            save: function () {
                this.$el.hide();
                this.isClosed = true;

                var defaultSettings = this.client.defaultSettings,
                    settings = this.client.settings,
                    value, $input;
                if (this.changedProperties.length == 0) {
                    console.log('settings; nothing changed');
                    return;
                }
                for (var property in defaultSettings){
                    if (defaultSettings.hasOwnProperty(property)){
                        value = settings[property];
                        if (typeof value == "boolean") {
                            $input = this.$el.find('input[name=' + property + ']');
                            value = $input.prop('checked');
                        }
                        else {
                            $input = this.$el.find('input[name=' + property + ']:checked');
                            value = $input.val();
                        }
                        if ($input) {
                            console.log('settings; save', property, value, $input.prop('type'));
                            settings[property] = value;
                        } else {
                            console.error('settings;', 'input element not found! ', property);
                        }
                    }
                }
                this.client.saveSettings();
            },

            load: function () {
                this.changedProperties = [];
                var defaultSettings = this.client.defaultSettings,
                    settings = this.client.settings,
                    value, $input;
                for (var property in defaultSettings){
                    if (defaultSettings.hasOwnProperty(property)){
                        value = settings[property];
                        if (typeof value == "boolean")
                            $input = this.$el.find('input[name=' + property + ']');
                        else
                            $input = this.$el.find('input[name=' + property + '][value=' + value + ']');
                        if ($input) {
                            console.log('settings; load', property, value, $input.prop('type'));
                            $input.prop('checked', !!value);
                        } else {
                            console.error('settings;', 'input element not found! ', property, value);
                        }
                    }
                }
            },

            close: function () {
                this.$el.hide();
                this.isClosed = true;

                //emit changed default
                var $input, value, property, settings = this.client.settings;
                for (var i = 0; i < this.changedProperties.length; i++){
                    property = this.changedProperties[i];
                    value = settings[property];
                    if (typeof value == "boolean")
                        $input = this.$el.find('input[name=' + property + ']');
                    else
                        $input = this.$el.find('input[name=' + property + '][value=' + value + ']');
                    if ($input) {
                        console.log('settings; default', {property: property, value: value, type: $input.prop('type')});
                        this.client._onSettingsChanged({property: property, value: value, type: $input.prop('type')});
                    } else {
                        console.error('settings;', 'input element not found! ', property, value);
                    }
                }
            },


            show: function () {
                this.$el.css({
                    top: ($(window).height() / 2) - (this.$el.outerHeight() / 2),
                    left: ($(window).width() / 2) - (this.$el.outerWidth() / 2)
                }).show();
                this.load();
            }

        });


        return SettingsView;
    });
