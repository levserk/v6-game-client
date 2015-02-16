define(['underscore', 'backbone', 'text!tpls/v6-HistoryMain.ejs', 'text!tpls/v6-historyHeaderTD.ejs', 'text!tpls/v6-historyTH.ejs', 'text!tpls/v6-historyTR.ejs', 'text!tpls/v6-ratingTab.ejs'],
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
                'click .closeIcon': 'close'
            },
            initialize: function(_conf) {
                this.conf = _conf;
                this.tabs = _conf.tabs;
                this.columns = _conf.columns;
                this.$el.html(this.tplMain());

                this.$head = this.$el.find('.historyHeader');
                this.$titles = $(this.$el.find('.historyTable thead tr')[0]);
                this.$tbody = $(this.$el.find('.historyTable tbody')[0]);

                this.ACTIVE_TAB = 'activeLink';
                this.UNACTIVE_TAB = 'unactiveLink';
                this.WIN_CLASS = 'historyWin';
                this.LOSE_CLASS = 'historyLose';
                this.DRAW_CLASS = 'historyDraw';

                this.renderTabs();
                this.renderHead();

                this.isClosed = false;
            },

            close: function () {
                this.$el.hide();
                this.isClosed = true;
            },

            renderTabs: function() {
                for (var i in this.tabs){
                    this.$head.append(this.tplTab(this.tabs[i]));
                    this.setActiveTab(this.tabs[0].id);
                }
            },

            renderHead:function() {

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
                        score: row.score
                    });
                }
                for (var i = 2; i < this.columns.length; i++){
                    col = row[this.columns[i].source];
                    if (this.columns[i].dynamic){
                        columns += this.tplTD((col['dynamic']>-1?'+':'')+ col['dynamic']);
                        columns += this.tplTD(col['value']);
                    } else
                    columns += this.tplTD(col);
                }

                return columns;
            },

            render: function(mode, history) {
                this.$tbody.children().remove();
                this.$el.show();
                if (!history) {
                    this.isClosed = false;
                    this.$el.find('.loading').show();
                }
                else {
                    this.$el.find('.loading').hide();
                    console.log('render history', history);
                    this.renderHistory(mode, history);
                }

                return this;
            },

            setActiveTab: function(id){
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