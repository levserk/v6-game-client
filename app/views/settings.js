define(['underscore', 'backbone', 'text!tpls/v6-settingsMain.ejs', 'text!tpls/v6-settingsDefault.ejs',
        'text!tpls/v6-settingsBlackListUser.ejs'],
    function(_, Backbone, tplMain, tplDefault, tplUser) {
        'use strict';

        var SettingsView = Backbone.View.extend({
            tagName: 'div',
            id: 'v6-settings',
            tplMain: _.template(tplMain),
            tplDefault: _.template(tplDefault),
            tplUser: _.template(tplUser),
            events: {
                'click .closeIcon': 'save',
                'change input': 'changed',
                'change select': 'changed',
                'click .confirmBtn': 'save',
                'click .removeBtn': 'removeUser',
                'click .showBlackListBtn': 'showBlackList'
            },


            initialize: function(client) {
                this.client = client;
                this.images  = client.opts.images;
                this.changedProperties = [];
                this.$el.html(this.tplMain({
                    close:this.images.close,
                    locale: client.locale.settings,
                    settings: client.opts.settingsTemplate ? _.template(client.opts.settingsTemplate)() : this.tplDefault()
                }));
                this.listenTo(client, 'login', this.load.bind(this));
                $('body').append(this.$el);
                this.$el.hide();
                this.$el.draggable();
                this.isClosed = true;
            },

            changed: function (e){
                var $target = $(e.target),
                    type = $target.prop('type'),
                    property = $target.prop('name'),
                    value = (type == "radio" || type == "select-one") ? $target.val() : $target.prop('checked'),
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
                for (var property in defaultSettings) {
                    if (property != 'blacklist' && defaultSettings.hasOwnProperty(property)) {
                        value = settings[property];
                        if (typeof value == "boolean") {
                            $input = this.$el.find('input[name=' + property + ']');
                            value = $input.prop('checked');
                        }
                        else {
                            $input = this.$el.find('input[name=' + property + ']:checked');
                            if (!$input.length){
                                $input = this.$el.find('[name=' + property + ']');
                            }
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
                        if (property == "blacklist"){
                            this.renderBlackList(value)
                        } else {
                            if (typeof value == "boolean")
                                $input = this.$el.find('input[name=' + property + ']');
                            else {
                                $input = this.$el.find('input[name=' + property + '][value=' + value + ']');
                            }
                            if ($input.length) {
                                $input.prop('checked', !!value);
                            } else {// try find select
                                $input = this.$el.find('[name=' + property + ']');
                                $input.val(value);
                                (this.$el.find('input[name=' + property + '][value=' + value + ']')).attr('selected', true);
                            }

                            if ($input.length) {
                                console.log('settings; load', property, value, $input.prop('type'));
                            } else {
                                console.error('settings;', 'input element not found! ', property, value);
                            }
                        }
                    }
                }
            },

            cancel: function () {
                //emit changed default
                var $input, value, property, settings = this.client.settings;
                for (var i = 0; i < this.changedProperties.length; i++){
                    property = this.changedProperties[i];
                    value = settings[property];
                    if (typeof value == "boolean")
                        $input = this.$el.find('input[name=' + property + ']');
                    else {
                        $input = this.$el.find('input[name=' + property + '][value=' + value + ']');
                        if (!$input.length) {
                            // try find select
                            $input = this.$el.find('[name=' + property + '] [value=' + value + ']');
                        }
                    }
                    if ($input.length) {
                        console.log('settings; default', {property: property, value: value, type: $input.prop('type')});
                        this.client._onSettingsChanged({property: property, value: value, type: $input.prop('type')});
                    } else {
                        console.error('settings;', 'input element not found! ', property, value);
                    }
                }
            },


            show: function () {
                this.$el.removeClass('showBlackList').css({
                    top: ($(window).height() / 2) - (this.$el.outerHeight() / 2),
                    left: ($(window).width() / 2) - (this.$el.outerWidth() / 2)
                })
                    .show();
                this.load();
                this.isClosed = false;
            },

            showBlackList: function () {
                this.$el.addClass('showBlackList');
            },

            removeUser: function(e){
                var $target = $(e.target);
                this.client.chatManager.removeUserFromBlackList($target.attr('data-userId'));
            },

            renderBlackList: function(blacklist) {
                blacklist = blacklist || this.client.settings.blacklist;
                var block = this.$el.find('.blacklistContainer div').empty();
                if ($.isEmptyObject(blacklist)){
                    block.append('<i>' + this.client.locale.settings.emptyBL + '</i>');
                } else {
                    for (var userId in blacklist){
                        block.append(this.tplUser({
                            user: blacklist[userId],
                            locale: this.client.locale.settings
                        }));
                    }
                }
            },

            getCurrentSettings: function() {
                var defaultSettings = this.client.defaultSettings,
                    settings = $.extend({}, this.client.settings),
                    value, $input;
                for (var property in defaultSettings){
                    if (property != 'blacklist' && defaultSettings.hasOwnProperty(property)){
                        value = settings[property];
                        if (typeof value == "boolean") {
                            $input = this.$el.find('input[name=' + property + ']');
                            value = $input.prop('checked');
                        }
                        else {
                            $input = this.$el.find('input[name=' + property + ']:checked');
                            if (!$input.length) {
                                // try find select
                                $input = this.$el.find('[name=' + property + ']');
                            }
                            value = $input.val();
                        }
                        if ($input.length) {
                            settings[property] = value;
                        } else {
                            settings[property] = this.client.settings[property]
                        }
                    }
                }
                return settings;
            }

        });


        return SettingsView;
    });
