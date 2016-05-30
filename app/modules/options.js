define([], function () {
    'use strict';
    var Options = function (opts, gameVariationId) {
        opts.lang = opts.lang || window._lang;
        opts.sounds = $.extend({}, defaultSounds, opts.sounds || {});
        opts.modes = opts.modes || opts.gameModes || ['default'];
        opts.blocks = opts.blocks || {};
        opts.vk = opts.vk || {};
        opts.images = defaultImages;
        opts.localization = opts.localization || {};

        var gameOptions = gameVariationId ? gamesOptions[gameVariationId] : null;
        opts = $.extend({}, defaultOptions, gameOptions, opts);
        opts.idleTimeout = opts.idleTimeout * 1000;

        return opts;
    };

    var defaultOptions = {
        lang: 'ru',
        game: false,
        modes: false,
        blocks: {},
        images: {},
        vk: {},
        sounds: {},
        localization: {},
        resultDialogDelay: 0,
        reload: false,
        turnTime: 60,
        idleTimeout: 60,
        loadRanksInRating: false,
        autoShowProfile: false,
        shortGuestNames: false,
        newGameFormat: false,
        showSpectators: false,
        showButtonsPanel: false,
        enableConsole: false,
        autoReconnect: true,
        reconnectOnError: true,
        reconnectOnDelay: true,
        showHidden: false,
        showCheaters: false,
        apiEnable: false,
        api: document.domain + "/api/",
        showRank: 'place',
        isAdmin: false,
        showChatTakeBack: false,
        showFocusLost: false
    };

    var gamesOptions = {

        "3": { // chess
            showChatTakeBack: true,
            showFocusLost: true
        },

        "8": { // gomoku
            showChatTakeBack: true,
            showFocusLost: true
        },

        "17": { // checkers
            reconnectOnError: true,
            reconnectOnDelay: true
        },

        "30": { //balda
            showFocusLost: true
        }

    };

    var defaultImages = {
        close: '//logic-games.spb.ru/v6-game-client/app/i/close.png',
        spin: '//logic-games.spb.ru/v6-game-client/app/i/spin.gif',
        sortAsc: '//logic-games.spb.ru/v6-game-client/app/i/sort-asc.png',
        sortDesc: '//logic-games.spb.ru/v6-game-client/app/i/sort-desc.png',
        sortBoth: '//logic-games.spb.ru/v6-game-client/app/i/sort-both.png',
        del: '//logic-games.spb.ru/v6-game-client/app/i/delete.png',
        block: '//logic-games.spb.ru/v6-game-client/app/i/stop.png'
    };

    var defaultSounds = {
        start: {
            src: '//logic-games.spb.ru/v6-game-client/app/audio/v6-game-start.ogg',
            volume: 0.5
        },
        turn: {
            src: '//logic-games.spb.ru/v6-game-client/app/audio/v6-game-turn.ogg',
            enable: false
        },
        win: {
            src: '//logic-games.spb.ru/v6-game-client/app/audio/v6-game-win.ogg',
            volume: 0.5,
            enable: false
        },
        lose: {
            src: '//logic-games.spb.ru/v6-game-client/app/audio/v6-game-lose.ogg',
            volume: 0.5,
            enable: false
        },
        invite: {
            src: '//logic-games.spb.ru/v6-game-client/app/audio/v6-invite.ogg'
        },
        timeout: {
            src: '//logic-games.spb.ru/v6-game-client/app/audio/v6-timeout.ogg'
        }
    };

    return Options;
});