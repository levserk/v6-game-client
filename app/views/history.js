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
            tplTRpenalty: function(date, value, columns){return '<tr class="historyPenalty"><td>'+date+'</td><td colspan="'+columns+'">'+value+'</td></tr>'},
            tplTab: _.template(tplTab),
            events: {
                'click .closeIcon': 'close',
                'click .historyTable tr': 'trClicked',
                'click .historyTable .userName': 'userClicked',
                'click .historyHeader span': 'tabClicked',
                'click #showMore': 'showMore',
                'keyup #historyAutoComplete': 'filterChanged',
                'click .delete': 'clearFilter'
            },
            initialize: function(_conf, manager) {
                this.conf = _conf;
                this._manager = manager;
                this.locale = manager.client.locale.history;
                this.tabs = _conf.tabs;
                this.columns = _conf.columns;
                this.$el.html(this.tplMain({
                    close: _conf.images.close, imgDel: _conf.images.del, spin: _conf.images.spin, locale: this.locale
                }));

                this.$head = this.$el.find('.historyHeader');
                this.$titles = $(this.$el.find('.historyTable thead tr')[0]);
                this.$tbody = $(this.$el.find('.historyTable tbody')[0]);
                this.$noHistory = $(this.$el.find('.noHistory'));
                this.$showMore = $(this.$el.find('#showMore'));
                this.$filter = $(this.$el.find('#historyAutoComplete'));

                this.ACTIVE_TAB = 'activeLink';
                this.UNACTIVE_TAB = 'unactiveLink';
                this.WIN_CLASS = 'historyWin';
                this.LOSE_CLASS = 'historyLose';
                this.DRAW_CLASS = 'historyDraw';
                this.SELECTED_CLASS = 'historySelected';

                this.renderTabs();
                this.renderHead();

                this.isClosed = false;
            },

            trClicked: function(e){
                if ($(e.target).hasClass('userName')) return;
                var id  = $(e.currentTarget).attr('data-id');
                this.$el.find('.' + this.SELECTED_CLASS).removeClass(this.SELECTED_CLASS);
                $(e.currentTarget).addClass(this.SELECTED_CLASS);
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
                this._manager._getHistory(id, null, false);
            },

            filterChanged: function(e) {
                if (e.type === 'keyup')
                    if (e.keyCode == 13 || e.target.value.length == 0) {
                        this._manager._getHistory(this.currentTab.id, null, false);
                }
            },

            clearFilter: function() {
                this.setFilter('');
                this._manager._getHistory(this.currentTab.id, null, false);
            },

            close: function () {
                this.$el.hide();
                this.isClosed = true;
                this.setFilter('');
            },

            showMore:function () {
                this._manager._getHistory(this.currentTab.id, null, true);
            },

            renderTabs: function() {
                for (var i = this.tabs.length - 1; i >= 0; i--){
                    this.$head.prepend(this.tplTab(this.tabs[i]));
                    this.setActiveTab(this.tabs[0].id);
                }
                if (!this.tabs || this.tabs.length == 0) {
                    this.currentTab = {
                        id: this._manager.client.currentMode
                    }
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
                if (session.penalty){
                    this.$tbody.append(
                        this.tplTRpenalty(session.date, session.text, this.columns.length)
                    );
                }
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

                if (this.$filter.val().length > 0) this.$filter.parent().find('.delete').show();
                else this.$filter.parent().find('.delete').hide();

                if (hideClose === true) this.$el.find('.closeIcon').hide();
                if (hideClose === false) this.$el.find('.closeIcon').show();
                if (!showMore) this.$showMore.hide(); else this.$showMore.show();

                if (!history) {
                    this.isClosed = false;
                    this.$el.find('.loading').show();
                    this.$noHistory.hide();
                }
                else {
                    this.clearHistory();
                    if (history.length == 0) this.$noHistory.show();
                    this.$el.find('.loading').hide();
                    console.log('render history', history);
                    this.renderHistory(mode, history);
                }

                return this;
            },

            clearHistory: function() {
                this.$tbody.children().remove();
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
            },


            setFilter: function(filter) {
                this.$filter.val(filter);
            },

            getFilter: function() {
                return this.$filter.val();
            }

        });
        return HistoryView;
    });