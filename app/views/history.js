define(['underscore', 'backbone', 'text!tpls/v6-historyMain.ejs', 'text!tpls/v6-historyHeaderTD.ejs', 'text!tpls/v6-historyTH.ejs', 'text!tpls/v6-historyTR.ejs', 'text!tpls/v6-ratingTab.ejs'],
    function(_, Backbone, tplMain, tplTD, tplTH, tplTR, tplTab) {
        'use strict';

        var HistoryView = Backbone.View.extend({
            tagName: 'div',
            id: 'v6History',
            tplMain: _.template(tplMain),
            tplHeadTD: _.template(tplTD),
            tplTD: function(value){return '<td>'+value+'</td>'},
            tplTH: _.template(tplTH),
            tplTR: _.template(tplTR),
            tplTab: _.template(tplTab),
            events: {
                'click .closeIcon': 'close',
                'click .historyTable tr': 'trClicked',
                'click .historyTable .userName': 'userClicked',
                'click .historyHeader span': 'tabClicked',
                'click #showMore': 'showMore'
            },
            initialize: function(_conf, manager) {
                this.conf = _conf;
                this._manager = manager;
                this.tabs = _conf.tabs;
                this.columns = _conf.columns;
                this.$el.html(this.tplMain({close: _conf.images.close, spin: _conf.images.spin}));

                this.$head = this.$el.find('.historyHeader');
                this.$titles = $(this.$el.find('.historyTable thead tr')[0]);
                this.$tbody = $(this.$el.find('.historyTable tbody')[0]);
                this.$noHistory = $(this.$el.find('.noHistory'));
                this.$showMore = $(this.$el.find('#showMore'));

                this.ACTIVE_TAB = 'activeLink';
                this.UNACTIVE_TAB = 'unactiveLink';
                this.WIN_CLASS = 'historyWin';
                this.LOSE_CLASS = 'historyLose';
                this.DRAW_CLASS = 'historyDraw';

                this.renderTabs();
                this.renderHead();

                this.isClosed = false;
            },

            trClicked: function(e){
                if ($(e.target).hasClass('sessionHeader') || $(e.target).hasClass('userName')) return;
                var id  = $(e.currentTarget).attr('data-id');
                //TODO save player userId history
                this._manager.getGame(id);
            },

            userClicked: function (e){
                var userId  = $(e.currentTarget).attr('data-userid');
                var userName = $(e.currentTarget).html();
                this._manager.client.onShowProfile(userId, userName);
            },

            tabClicked: function(e){
                var id  = $(e.currentTarget).attr('data-idtab');
                this.setActiveTab(id);
                this._manager.getHistory(id, true);
            },

            close: function () {
                this.$el.hide();
                this.isClosed = true;
            },

            showMore:function () {
                this._manager.getHistory(false, true, null, true);
            },

            renderTabs: function() {
                for (var i in this.tabs){
                    this.$head.append(this.tplTab(this.tabs[i]));
                    this.setActiveTab(this.tabs[0].id);
                }
            },

            renderHead:function() {
                for (var i = 0; i < this.columns.length; i++){
                    this.$titles.append(this.tplTH({
                            title: this.columns[i].title,
                            value: this.columns[i].title,
                            colspan: this.columns[i].dynamic?2:1
                        })
                    );
                }
            },

            renderHistory: function (mode, history) {
                for (var i = 0; i < history.length; i++) {
                    this.renderSession(mode, history[i]);
                }
            },

            renderSession:function(mode, session){
                var row, trclass;
                for (var i = 0; i < session.length; i++){
                    row = this.renderRow(mode, session[i], i==0, session.length);
                    if (session[i].result == 'draw') trclass = this.DRAW_CLASS;
                    else if (session[i].result == 'win') trclass = this.WIN_CLASS;
                         else trclass = this.LOSE_CLASS;

                    this.$tbody.append(this.tplTR({
                        title:session[i].result,
                        trclass:trclass,
                        id:session[i].id,
                        value:row
                    }));
                }
            },

            renderRow: function(mode, row, isFirst, count){
                var columns = "", col;
                if (isFirst){
                    columns = this.tplHeadTD({
                        rows:count,
                        date:row.date,
                        userId: row.opponent.userId,
                        userName: row.opponent.userName,
                        rank: row.opponent[mode]['rank'],
                        eloDiff: count>1?row.elo.diff:'',
                        score: row.gameScore
                    });
                }
                for (var i = 2; i < this.columns.length; i++){
                    col = row[this.columns[i].source];
                    if (col == undefined) col = this.columns[i].undef;
                    if (this.columns[i].dynamic){
                        columns += this.tplTD((col['dynamic']>-1&&col['dynamic']!==''?'+':'')+ col['dynamic']);
                        columns += this.tplTD(col['value']);
                    } else
                    columns += this.tplTD(col);
                }

                return columns;
            },

            render: function(mode, history, hideClose, showMore) {
                this.$el.show();
                this.setActiveTab(mode);
                if (hideClose === true) this.$el.find('.closeIcon').hide();
                if (hideClose === false) this.$el.find('.closeIcon').show();
                if (!showMore) this.$showMore.hide(); else this.$showMore.show();

                if (!history) {
                    this.isClosed = false;
                    this.$el.find('.loading').show();
                    this.$noHistory.hide();
                }
                else {
                    this.$tbody.children().remove();
                    if (history.length == 0) this.$noHistory.show();
                    this.$el.find('.loading').hide();
                    console.log('render history', history);
                    this.renderHistory(mode, history);
                }

                return this;
            },

            setActiveTab: function(id){
                if (!id || !this.tabs || this.tabs.length < 2) return;
                for (var i = 0; i < this.tabs.length; i++){
                    this.tabs[i].active = false;
                    if (this.tabs[i].id != id)
                        this.$head.find('span[data-idtab="'+this.tabs[i].id+'"]').removeClass(this.ACTIVE_TAB).addClass(this.UNACTIVE_TAB);
                    else {
                        this.$head.find('span[data-idtab="'+this.tabs[i].id+'"]').removeClass(this.UNACTIVE_TAB).addClass(this.ACTIVE_TAB);
                        this.currentTab = this.tabs[i];
                    }
                }
            }


        });
        return HistoryView;
    });