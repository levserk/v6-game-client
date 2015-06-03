define(['underscore', 'backbone', 'text!tpls/v6-ratingMain.ejs', 'text!tpls/v6-ratingTD.ejs', 'text!tpls/v6-ratingTH.ejs',
        'text!tpls/v6-ratingTR.ejs', 'text!tpls/v6-ratingTab.ejs', 'text!tpls/v6-ratingSearch.ejs',
        'text!tpls/v6-ratingPhoto.ejs', 'text!tpls/v6-ratingUser.ejs'],
    function(_, Backbone, tplMain, tplTD, tplTH, tplTR, tplTab, tplSearch, tplPhoto, tplUser) {
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
            tplUser: _.template(tplUser),
            tplPhoto: _.template(tplPhoto),
            events: {
                'click .closeIcon': 'close',
                'click #closeRatingBtn': 'close',
                'click .headTitles th': 'thClicked',
                'click .headIcons th': 'thClicked',
                'click .filterPanel span': 'tabClicked',
                'click .ratingTable .userName': 'userClicked',
                'click #ratingShowMore': 'showMore',
                'keyup #ratingAutoComplete': 'filterChanged',
                'click .delete': 'clearFilter',
                'click #jumpTop': 'scrollTop'
            },

            thClicked: function(e){
                var id = $(e.currentTarget).attr('data-idcol');
                for (var i = 0; i < this.columns.length; i++){
                    if (this.columns[i].id == id && this.columns[i].canOrder){
                        this.setColumnOrder(id);
                        console.log('log; rating col clicked',this.columns[i]);
                        this.getRatings();
                        break;
                    }
                }
            },

            tabClicked: function (e){
                var id = $(e.currentTarget).attr('data-idtab');
                for (var i = 0; i < this.subTabs.length; i++){
                    if (this.subTabs[i].id == id){
                        this.setActiveSubTab(id);
                        this.getRatings();
                        return;
                    }
                }
            },

            userClicked: function (e){
                var userId = $(e.currentTarget).attr('data-userid');
                var userName = $(e.currentTarget).html();
                this.manager.client.onShowProfile(userId, userName);
            },

            showMore: function() {
                this.getRatings(true);
            },

            filterChanged: function(e) {
                if (e.type === 'keyup')
                    if (e.keyCode == 13 || e.target.value.length == 0) {
                        this.getRatings();
                    }
            },

            clearFilter: function() {
                this.$filter.val('');
                this.getRatings();
            },

            getRatings: function(showmore) {
                this.manager.getRatings(this.currentSubTab.id, this.currentCollumn.id,
                    this.currentCollumn.order < 0? 'desc':'asc', this.$filter.val(), !!showmore);
            },

            scrollTop: function(){
                $('html,body').animate({
                    scrollTop: this.$el.offset().top
                }, 300);
            },

            initialize: function(_conf, _manager) {
                this.conf = _conf;
                this.manager = _manager;
                this.tabs = _conf.tabs;
                this.subTabs = _conf.subTabs;
                this.columns = _conf.columns;
                this.$el.html(this.tplMain({close:this.conf.images.close, spin: this.conf.images.spin}));

                this.$tabs = $(this.$el.find('.filterPanel').children()[0]);
                this.$titles = this.$el.find('.headTitles');
                this.$icons = this.$el.find('.headIcons');
                this.$head = this.$icons.parent();
                this.$tbody = $(this.$el.find('.ratingTable tbody')[0]);
                this.$showMore = $(this.$el.find('#ratingShowMore'));


                this.NOVICE = '<span style="color: #C42E21 !important;">новичок</span>';
                this.IMG_BOTH = '<img src="' + _conf.images.sortBoth + '">';
                this.IMG_ASC= '<img src="' + _conf.images.sortAsc + '">';
                this.IMG_DESC = '<img src="' + _conf.images.sortDesc + '">';
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
                if (this.subTabs.length > 1) {
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
                        if (col.id == 'ratingElo') col.order = 1;
                        else col.order = 0;
                    }
                    th = {
                        id: col.id,
                        title: col.topTitle||'',
                        value: col.title
                    };
                    this.$titles.append(this.tplTH(th));
                    th.value = col.canOrder?this.IMG_BOTH:'';
                    if (col.id == 'rank') th.value= "";
                    if (col.id == 'userName') th.value = this.tplSearch({imgDel: this.conf.images.del});
                    this.$icons.append(this.tplTH(th));
                }
                this.setColumnOrder('ratingElo');
                this.$filter = $(this.$el.find('#ratingAutoComplete'));
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
                    else if (row.online) trclass += this.ONLINE_CLASS;
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
                    if (row[this.columns[i].source] == null) row[this.columns[i].source] = this.columns[i].undef;
                    col = {
                        id: this.columns[i].id,
                        value: row[this.columns[i].source],
                        sup: ''
                    };
                    if (typeof this.columns[i].func == "function"){
                        col.value = this.columns[i].func(col.value);
                    }
                    if (col.id == 'userName') col.value = this.tplUser({
                        userName: row.userName,
                        userId: row.userId
                    });
                    if (isUser){ // Render user rating row (infoUser)
                        if (col.id == 'rank') col.value = this.YOU;
                        if (col.id == 'userName') col.value += ' ('+(row.rank>0 ? row.rank : '-' ) + ' место)';
                    }
                    if (col.id == 'userName' && row.photo) col.value += this.tplPhoto(row.photo); //TODO: photo, photo link
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

            setColumnOrder: function (id, order){
                for (var i = 2; i < this.columns.length; i++){
                    if (this.columns[i].id != id) {
                        this.columns[i].order = 0;
                        this.$titles.find('th[data-idcol="'+this.columns[i].id+'"]').removeClass(this.SORT);
                        this.$icons.find('th[data-idcol="'+this.columns[i].id+'"]').removeClass(this.SORT).html(this.columns[i].canOrder?this.IMG_BOTH:'');
                    } else {
                        this.currentCollumn = this.columns[i];
                        if (!order) {
                            if (this.columns[i].order < 1) this.columns[i].order = 1;
                            else this.columns[i].order = -1;
                        } else {
                            this.columns[i].order = order == 'desc' ? -1 : 1;
                        }

                        this.$titles.find('th[data-idcol="' + this.columns[i].id + '"]').addClass(this.SORT);
                        this.$icons.find('th[data-idcol="' + this.columns[i].id + '"]').addClass(this.SORT).html(this.columns[i].order>0?this.IMG_ASC:this.IMG_DESC);
                    }
                }
            },

            render: function(ratings, mode, column, order, append, showMore) {
                this.$el.show();
                this.setColumnOrder(column, order);

                if (this.$filter.val() && this.$filter.val().length > 0) this.$filter.parent().find('.delete').show();
                else this.$filter.parent().find('.delete').hide();

                if (!showMore) this.$showMore.hide(); else this.$showMore.show();
                if (mode) this.setActiveSubTab(mode);
                if (!ratings) {
                    this.isClosed = false;
                    this.$el.find('.loading').show();
                }
                else {
                    this.$el.find('.loading').hide();
                    this.$head.find('.'+this.HEAD_USER_CLASS).remove();
                    if (!append) this.$tbody.children().remove();
                    console.log('render ratings', ratings);
                    this.renderRatings(ratings);
                }

                if (this.manager.client.isAdmin && !this.$tabs.find('.adminLink').length){
                    var $span = $('<span>').html('<a href="/admin">Админка</a>')
                        .addClass('adminLink').appendTo(this.$tabs);
                }

                return this;
            }


        });
        return RatingView;
    });