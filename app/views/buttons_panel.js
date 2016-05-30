define(['underscore', 'backbone', 'text!tpls/v6-buttonsPanel.ejs', 'screenfull'],
    function (_, Backbone, tplMain, screenfull) {
        screenfull = window.screenfull;
        'use strict';
        var ButtonsPanelView = Backbone.View.extend({
            tagName: 'div',
            id: 'v6-buttonsPanel',
            tplMain: _.template(tplMain),
            events: {
                'click  span': 'buttonClick'
            },
            buttonClick: function (e) {
                var btn = $(e.currentTarget);
                console.log(btn.attr('data-action'));
                switch (btn.attr('data-action')) {
                    case 'zoomOut':
                        this.zoom(-1);
                        break;
                    case 'zoomIn':
                        this.zoom(+1);
                        break;
                    case 'fullScreenOn':
                        this.fullScreen(true);
                        btn.attr('data-action', 'fullScreenOff');
                        break;
                    case 'fullScreenOff':
                        this.fullScreen(false);
                        btn.attr('data-action', 'fullScreenOn');
                        break;
                    case 'soundOn':
                        this.setSound(true);
                        break;
                    case 'soundOff':
                        this.setSound(false);
                        break;
                }
            },
            initialize: function (_client) {
                this.images = _client.opts.images;
                this.client = _client;
                this.locale = _client.locale.userList;
                this.$el.html(this.tplMain());
                this.listenTo(this.client, 'settings_saved', this.applySettings.bind(this));
                this.listenTo(this.client, 'login', this.applySettings.bind(this));
                document.addEventListener(screenfull.raw.fullscreenchange, this.onFullScreenChange.bind(this));
            },
            applySettings: function () {
                if (!this.client.opts.showButtonsPanel) return;
                this.setSound(this.client.settings.sounds);
            },
            setSound: function(value){
                if (!this.client.opts.showButtonsPanel) return;
                this.client.settings.sounds = value;
                var action = value ? 'soundOff' : 'soundOn'
                    ,$btn = this.$el.find('.v6-buttonsPanel .switchSound');
                $btn.removeClass('soundOff').removeClass('soundOn').addClass(action).attr('data-action', action);
            },
            zoom: function(value) {

                document.body.style['transform-origin'] = '0 0';
                document.body.style['transition'] = 'all 0.2s ease-out 0s';
                var zoom = 1, delta = 0.02;
                if (document.body.style.transform && document.body.style.transform.substring(0,6) == "scale("){
                    try {
                        zoom = document.body.style.transform.substring(6);
                        zoom = parseFloat(zoom.substring(0, zoom.length - 1));
                    } catch (e){
                        console.error(e);
                        zoom = 1;
                    }
                    if (zoom < 0) zoom = 1;
                }
                if (value > 0) zoom += delta; else zoom -= delta;
                if (zoom > 1) {
                    $('html').css('overflow-x', 'scroll');
                } else {
                    $('html').css('overflow-x', 'hidden');
                }
                document.body.style.transform = "scale(" + zoom + ")";
            },
            fullScreen: function(value){
                if (screenfull.enabled) {
                    if (value) {
                        screenfull.request();
                    } else screenfull.exit();
                }

            },
            onFullScreenChange: function(){
                var action = screenfull.isFullscreen ? 'fullScreenOff' : 'fullScreenOn'
                    ,$btn = this.$el.find('.v6-buttonsPanel .switchScreen');
                $btn.removeClass('fullScreenOn').removeClass('fullScreenOff').addClass(action).attr('data-action', action);
                this.client.emit('full_screen', screenfull.isFullscreen);
            }
        });

        function fullScreen(o) {
            var doc = document.body;
            if(doc.requestFullscreen){
                doc.requestFullscreen();
            }
            else if(doc.mozRequestFullScreen){
                doc.mozRequestFullScreen();
            }
            else if(doc.webkitRequestFullScreen){
                doc.webkitRequestFullScreen();
            }
        }

        function fullScreenCancel() {
            if(document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if(document.webkitCancelFullScreen ) {
                document.webkitCancelFullScreen();
            } else if(document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            }
        }
        return ButtonsPanelView;
    });