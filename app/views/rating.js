define(['underscore', 'backbone', 'text!tpls/v6-ratingMain.ejs', 'text!tpls/v6-ratingTD.ejs', 'text!tpls/v6-ratingTH.ejs', 'text!tpls/v6-ratingTR.ejs', 'text!tpls/v6-ratingTab.ejs', 'text!tpls/v6-ratingSearch.ejs', 'text!tpls/v6-ratingPhoto.ejs'],
    function(_, Backbone, tplMain, tplTD, tplTH, tplTR, tplTab, tplSearch, tplPhoto) {
        'use strict';

        var RatingView = Backbone.View.extend({
            tagName: 'div',
            id: 'v6Rating',
            tplMain: _.template(tplMain),
            tplTD: _.template(tplTD),
            tplTH: _.template(tplTH),
            tplTR: _.template(tplTR),
            tplTab: _.template(tplTab),
            tplSearch: _.template(tplSearch),
            tplPhoto: _.template(tplPhoto),
            events: {
                'click .closeIcon': 'close',
                'click #closeRatingBtn': 'close'
            },
            initialize: function(_conf) {
                this.conf = _conf;
                this.tabs = _conf.tabs;
                this.subTabs = _conf.subTabs;
                this.columns = _conf.columns;
                this.$el.html(this.tplMain());

                this.$tabs = $(this.$el.find('.filterPanel').children()[0]);
                this.$titles = this.$el.find('.headTitles');
                this.$icons = this.$el.find('.headIcons');
                this.$head = this.$icons.parent();
                this.$tbody = $(this.$el.find('.ratingTable tbody')[0]);

                this.NOVICE = '<span style="color: #C42E21 !important;">новичок</span>';
                this.IMG_BOTH = '<img src="i/sort-both.png">';
                this.IMG_ASC= '<img src="i/sort-asc.png">';
                this.IMG_DESC = '<img src="i/sort-desc.png">';
                this.ACTIVE_TAB = 'activeLink';
                this.UNACTIVE_TAB = 'unactiveLink';
                this.SORT = 'sorted';
                this.YOU = 'Вы:';
                this.HEAD_USER_CLASS = 'headUser';
                this.ACTIVE_CLASS = 'active';
                this.ONLINE_CLASS = 'online';
                this.USER_CLASS = 'user';

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
                    this.$tabs.append(this.tplTab(this.tabs[i]));
                    this.setActiveTab(this.tabs[0].id);
                }
                if (this.subTabs.length>1) {
                    this.$tabs.append('<br>');
                    for (var i in this.subTabs){
                        this.$tabs.append(this.tplTab(this.subTabs[i]));
                        this.setActiveSubTab(this.subTabs[0].id);
                    }
                }
            },

            renderHead:function() {
                var col, th;
                for (var i in this.columns) {
                    col = this.columns[i];
                    if (col.canOrder) {
                        if (col.id == 'Elo') col.order = 1;
                        else col.order = 0;
                    }
                    th = {
                        id: col.id,
                        title: col.topTitle||'',
                        value: col.title
                    };
                    this.$titles.append(this.tplTH(th));
                    th.value = this.IMG_BOTH;
                    if (col.id == 'Rank') th.value= "";
                    if (col.id == 'UserName') th.value = this.tplSearch();
                    this.$icons.append(this.tplTH(th));
                }
                this.setColumnOrder('Elo');
            },

            renderRatings: function (ratings) {
                var row;
                if (ratings.infoUser) {
                    row = ratings.infoUser;
                    this.$head.append(this.tplTR({
                        trclass: this.HEAD_USER_CLASS,
                        userId: row.userId,
                        userName: row.userName,
                        value: this.renderRow(row, true)
                    }));
                }
                if (!ratings.allUsers) return;
                for (var i = 0; i < ratings.allUsers.length; i++) {
                    row = ratings.allUsers[i];
                    var trclass = '';
                    if (row.user) trclass += this.USER_CLASS + ' ';
                    if (row.active) trclass += this.ACTIVE_CLASS;
                    this.$tbody.append(this.tplTR({
                        trclass: trclass,
                        userId: row.userId,
                        userName: row.userName,
                        value: this.renderRow(row)
                    }));
                }
            },

            renderRow: function(row, isUser){
                var columns = ""; var col;
                for (var i = 0; i < this.columns.length; i++){
                    col = {
                        id: this.columns[i].id,
                        value: row[this.columns[i].source],
                        sup: ''
                    };
                    if (isUser){
                        if (col.id == 'Rank') col.value = this.YOU;
                        if (col.id == 'UserName') col.value += '('+row.rank+' место)';
                    }
                    if (col.id == 'UserName' && row.photo) col.value += this.tplPhoto(row.photo); //TODO: photo, photo link
                    columns += this.tplTD(col);
                }
                return columns;
            },

            setActiveTab: function(id){
                for (var i = 0; i < this.tabs.length; i++){
                    this.tabs[i].active = false;
                    if (this.tabs[i].id != id)
                        this.$tabs.find('span[data-idtab="'+this.tabs[i].id+'"]').removeClass(this.ACTIVE_TAB).addClass(this.UNACTIVE_TAB);
                    else {
                        this.$tabs.find('span[data-idtab="'+this.tabs[i].id+'"]').removeClass(this.UNACTIVE_TAB).addClass(this.ACTIVE_TAB);
                        this.currentTab = this.tabs[i];
                    }
                }
            },

            setActiveSubTab: function(id){
                for (var i = 0; i < this.subTabs.length; i++){
                    this.subTabs[i].active = false;
                    if (this.subTabs[i].id != id)
                        this.$tabs.find('span[data-idtab="'+this.subTabs[i].id+'"]').removeClass(this.ACTIVE_TAB).addClass(this.UNACTIVE_TAB);
                    else {
                        this.$tabs.find('span[data-idtab="'+this.subTabs[i].id+'"]').removeClass(this.UNACTIVE_TAB).addClass(this.ACTIVE_TAB);
                        this.currentSubTab = this.subTabs[i];
                    }
                }
            },

            setColumnOrder: function (id){
                for (var i = 2; i < this.columns.length; i++){
                    if (this.columns[i].id != id) {
                        this.columns[i].order = 0;
                        this.$titles.find('th[data-idcol="'+this.columns[i].id+'"]').removeClass(this.SORT);
                        this.$icons.find('th[data-idcol="'+this.columns[i].id+'"]').removeClass(this.SORT).html(this.IMG_BOTH);
                    } else {
                        this.currentCollumn = this.columns[i];
                        if (this.columns[i].order < 1) this.columns[i].order = 1;
                        else this.columns[i].order = -1;
                        this.$titles.find('th[data-idcol="' + this.columns[i].id + '"]').addClass(this.SORT);
                        this.$icons.find('th[data-idcol="' + this.columns[i].id + '"]').addClass(this.SORT).html(this.columns[i].order>0?this.IMG_ASC:this.IMG_DESC);
                    }
                }
            },

            render: function(ratings) {
                this.$head.find('.'+this.HEAD_USER_CLASS).remove();
                this.$tbody.children().remove();
                this.$el.show();
                if (!ratings) {
                    this.isClosed = false;
                    this.$el.find('.loading').show();
                }
                else {
                    this.$el.find('.loading').hide();
                    console.log('render ratings', ratings);
                    this.renderRatings(ratings);
                }

                return this;
            }


        });
        return RatingView;
    });