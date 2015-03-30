(function(jQuery, Underscore, Backbone) {/**
 * @license almond 0.3.0 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                name = baseParts.concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            var args = aps.call(arguments, 0);

            //If first arg is not require('string'), and there is only
            //one arg, it is the array form without a callback. Insert
            //a null so that the following concat is correct.
            if (typeof args[0] !== 'string' && args.length === 1) {
                args.push(null);
            }
            return req.apply(undef, args.concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("lib/almond.js", function(){});

/*!
 * EventEmitter v4.2.9 - git.io/ee
 * Oliver Caldwell
 * MIT license
 * @preserve
 */
(function(){function t(){}function i(t,n){for(var e=t.length;e--;)if(t[e].listener===n)return e;return-1}function n(e){return function(){return this[e].apply(this,arguments)}}var e=t.prototype,r=this,s=r.EventEmitter;e.getListeners=function(n){var r,e,t=this._getEvents();if(n instanceof RegExp){r={};for(e in t)t.hasOwnProperty(e)&&n.test(e)&&(r[e]=t[e])}else r=t[n]||(t[n]=[]);return r},e.flattenListeners=function(t){var e,n=[];for(e=0;e<t.length;e+=1)n.push(t[e].listener);return n},e.getListenersAsObject=function(n){var e,t=this.getListeners(n);return t instanceof Array&&(e={},e[n]=t),e||t},e.addListener=function(r,e){var t,n=this.getListenersAsObject(r),s="object"==typeof e;for(t in n)n.hasOwnProperty(t)&&-1===i(n[t],e)&&n[t].push(s?e:{listener:e,once:!1});return this},e.on=n("addListener"),e.addOnceListener=function(e,t){return this.addListener(e,{listener:t,once:!0})},e.once=n("addOnceListener"),e.defineEvent=function(e){return this.getListeners(e),this},e.defineEvents=function(t){for(var e=0;e<t.length;e+=1)this.defineEvent(t[e]);return this},e.removeListener=function(r,s){var n,e,t=this.getListenersAsObject(r);for(e in t)t.hasOwnProperty(e)&&(n=i(t[e],s),-1!==n&&t[e].splice(n,1));return this},e.off=n("removeListener"),e.addListeners=function(e,t){return this.manipulateListeners(!1,e,t)},e.removeListeners=function(e,t){return this.manipulateListeners(!0,e,t)},e.manipulateListeners=function(r,t,i){var e,n,s=r?this.removeListener:this.addListener,o=r?this.removeListeners:this.addListeners;if("object"!=typeof t||t instanceof RegExp)for(e=i.length;e--;)s.call(this,t,i[e]);else for(e in t)t.hasOwnProperty(e)&&(n=t[e])&&("function"==typeof n?s.call(this,e,n):o.call(this,e,n));return this},e.removeEvent=function(e){var t,r=typeof e,n=this._getEvents();if("string"===r)delete n[e];else if(e instanceof RegExp)for(t in n)n.hasOwnProperty(t)&&e.test(t)&&delete n[t];else delete this._events;return this},e.removeAllListeners=n("removeEvent"),e.emitEvent=function(r,o){var e,i,t,s,n=this.getListenersAsObject(r);for(t in n)if(n.hasOwnProperty(t))for(i=n[t].length;i--;)e=n[t][i],e.once===!0&&this.removeListener(r,e.listener),s=e.listener.apply(this,o||[]),s===this._getOnceReturnValue()&&this.removeListener(r,e.listener);return this},e.trigger=n("emitEvent"),e.emit=function(e){var t=Array.prototype.slice.call(arguments,1);return this.emitEvent(e,t)},e.setOnceReturnValue=function(e){return this._onceReturnValue=e,this},e._getOnceReturnValue=function(){return this.hasOwnProperty("_onceReturnValue")?this._onceReturnValue:!0},e._getEvents=function(){return this._events||(this._events={})},t.noConflict=function(){return r.EventEmitter=s,t},"function"==typeof define&&define.amd?define('EE',[],function(){return t}):"object"==typeof module&&module.exports?module.exports=t:r.EventEmitter=t}).call(this);
define('modules/game_manager',['EE'], function(EE) {
    

    var GameManager = function(client){
        this.client = client;
        this.currentRoom = null;
        this.client.on('disconnected', function(){
            // TODO: save or close current room
        });
    };

    GameManager.prototype  = new EE();


    GameManager.prototype.onMessage = function(message){
        var data = message.data, player = this.client.getPlayer(), i;
        console.log('game_manager;', 'message', message);
        switch (message.type) {
            case 'new_game':
                for ( i = 0; i < data.players.length; i++){
                    if (data.players[i] == player){
                        if (this.currentRoom)
                            if (this.currentRoom.isClosed) this.leaveRoom();
                            else throw new Error('start game before current game finished! old: '+this.currentRoom.id+' new:'+data.room);
                        this.onGameStart(data);
                    }
                }
                break;
            case 'end_game':
                break;
            case 'ready':
                console.log('game_manager;', 'user_ready', data);
                break;
            case 'round_start':
                this.onRoundStart(data);
                break;
            case 'turn':
                this.onTurn(data);
                break;
            case 'event':
                var user = this.getPlayer(data.user);
                console.log('game_manager;', 'game event', data, user);
                this.onUserEvent(user, data);
                break;
            case 'user_leave':
                var user = this.getPlayer(data);
                this.onUserLeave(user);
                break;
            case 'round_end':
                this.onRoundEnd(data);
                break;
            case 'game_restart':
                this.onGameRestart(data);
                break;
            case 'error':
                console.log('game_manager;', 'error', data);
                break;
        }
    };


    GameManager.prototype.onGameStart = function(room){
        room = new Room(room, this.client);
        console.log('game_manager;', 'emit game_start', room);
        this.currentRoom = room;
        this.emit('game_start', room);
        this.sendReady();
    };


    GameManager.prototype.onRoundStart = function (data){
        console.log('game_manager;', 'emit round_start', data);
        this.currentRoom.current = this.getPlayer(data.first);
        this.currentRoom.userTime = this.client.opts.turnTime * 1000;
        this.emit('round_start', {
            players: [
                this.getPlayer(data.players[0]),
                this.getPlayer(data.players[1])
            ],
            first: this.getPlayer(data.first),
            id: data.id,
            inviteData: data.inviteData,
            score: this.currentRoom.score
        });
        this.emitTime();
    };


    GameManager.prototype.onGameRestart = function (data) {
        console.log('game_manager;', 'game restart', data);

        //start game
        var room = new Room(data['roomInfo'], this.client);
        console.log('game_manager;', 'emit game_start', room);
        this.currentRoom = room;
        room.score = data.score || room.score;
        this.emit('game_start', room);

        this.onRoundStart(data['initData']);

        // load game history
        data.history = '['+data.history+']';
        data.history = data.history.replace(new RegExp('@', 'g'),',');
        var history = JSON.parse(data.history);
        if (data.playerTurns.length != 0){
            if (data.playerTurns.length == 1)
                data.playerTurns = data.playerTurns[0];
            history.push(data.playerTurns);
        }
        this.emit('game_load', history);

        // switch player
        data.nextPlayer = this.getPlayer(data.nextPlayer);
        if (data.nextPlayer){
            this.currentRoom.current = data.nextPlayer;
            this.currentRoom.userTime = this.client.opts.turnTime * 1000 - data.userTime;
            if (this.currentRoom.userTime < 0) this.currentRoom.userTime = 0;
            this.emit('switch_player', this.currentRoom.current);
            this.emitTime();
            if (!this.timeInterval){
                this.prevTime = null;
                this.timeInterval = setInterval(this.onTimeTick.bind(this), 100);
            }
        }
    };


    GameManager.prototype.onRoundEnd = function(data){
        console.log('game_manager', 'emit round_end', data, this.currentRoom);
        clearInterval(this.timeInterval);
        data.mode = this.currentRoom.data.mode;
        this.timeInterval = null;
        this.prevTime = null;
        this.currentRoom.current = null;
        this.currentRoom.score = data.score;
        if (data.winner){
            if (data.winner == this.client.getPlayer().userId) { // win
                console.log('game_manager;', 'win', data);
                data.result = 'win'
            } else { // lose
                console.log('game_manager;', 'lose', data);
                data.result = 'lose'
            }
        } else { // not save or draw
            if (data.winner == 'not_save') console.log('game_manager', 'not accepted', data);
            else {
                data.result = 'draw';
                console.log('game_manager;', 'draw', data);
            }
        }
        this.emit('round_end', data, this.client.getPlayer());
    };


    GameManager.prototype.onUserLeave = function(user){
        //TODO: check user is opponent or me
        this.currentRoom.isClosed = true;
        console.log('game_manager;', 'user_leave', this.currentRoom, user);
        if (user != this.client.getPlayer()) this.emit('user_leave', user);
        else this.leaveRoom();
    };


    GameManager.prototype.onTurn = function(data){
        console.log('game_manager;', 'emit turn', data);
        if (data.turn.nextPlayer) {
            data.nextPlayer = this.getPlayer(data.turn.nextPlayer);
            delete data.turn.nextPlayer;
        }
        this.emit('turn', data);
        if (data.nextPlayer){
            this.currentRoom.current = data.nextPlayer;
            this.currentRoom.userTime = this.client.opts.turnTime * 1000;
            this.emit('switch_player', this.currentRoom.current);
            this.emitTime();
            if (!this.timeInterval){
                this.prevTime = null;
                this.timeInterval = setInterval(this.onTimeTick.bind(this), 100);
            }
        }
    };


    GameManager.prototype.onUserEvent = function(user, event){
        switch (event.type){
            case 'draw':
                if (user == this.client.getPlayer()) return; // draw to yourself
                switch (event.action){
                    case 'ask':
                        this.emit('ask_draw', user);
                        break;
                    case 'cancel':
                        this.emit('cancel_draw', user);
                        break;
                }
                break;
            case 'timeout':
                if (event.nextPlayer) {
                    event.nextPlayer =  this.getPlayer(event.nextPlayer);
                    event.user = this.getPlayer(event.user);
                    this.emit('timeout', event);
                    this.currentRoom.current = event.nextPlayer;
                    this.emit('switch_player', this.currentRoom.current);
                }
                break;
            default:
                console.log('game_manager;', 'onUserEvent user:', user, 'event:', event);
                this.emit('event', event);
        }
    };


    GameManager.prototype.leaveGame = function(){
        if (!this.currentRoom){
            console.error('game_manager;', 'leaveGame', 'game not started!');
            return
        }
        // TODO: send to server leave game, block game and wait leave message
        this.client.send('game_manager', 'leave', 'server', true);
    };


    GameManager.prototype.leaveRoom = function(){
        if (!this.currentRoom){
            console.error('game_manager;', 'leaveRoom', 'game not started!');
            return
        }
        if (!this.currentRoom.isClosed) throw new Error('leave not closed room! '+ this.currentRoom.id);
        console.log('game_manager;', 'emit game_leave;', this.currentRoom);
        this.emit('game_leave', this.currentRoom);
        this.currentRoom = null;
    };


    GameManager.prototype.sendReady = function(){
        if (!this.currentRoom){
            console.error('game_manager;', 'sendReady', 'game not started!');
            return
        }
        this.client.send('game_manager', 'ready', 'server', true);
    };


    GameManager.prototype.sendTurn = function(turn){
        if (!this.currentRoom){
            console.error('game_manager;', 'sendTurn', 'game not started!');
            return
        }
        if (this.currentRoom.userTime < 1000) {
            console.warn('game_manager;', 'your time is out!');
            return;
        }
        this.client.send('game_manager', 'turn', 'server', turn);

    };


    GameManager.prototype.sendThrow = function(){
        if (!this.currentRoom){
            console.error('game_manager', 'sendThrow', 'game not started!');
            return
        }
        this.client.send('game_manager', 'event', 'server', {type:'throw'});
    };


    GameManager.prototype.sendDraw = function(){
        if (!this.currentRoom){
            console.error('game_manager;', 'sendDraw', 'game not started!');
            return
        }
        this.client.send('game_manager', 'event', 'server', {type:'draw', action:'ask'});
    };


    GameManager.prototype.sendEvent = function (type, event, target) {
        if (!this.currentRoom){
            console.error('game_manager;', 'sendEvent', 'game not started!');
            return
        }
        console.log('game_manager;', 'sendEvent', type, event);
        event.type = type;
        if (target) event.target = target;
        else target = 'server';
        this.client.send('game_manager', 'event', target, event);
    };


    GameManager.prototype.acceptDraw = function(){
        if (!this.currentRoom){
            console.error('game_manager;', 'acceptDraw', 'game not started!');
            return
        }
        this.client.send('game_manager', 'event', 'server', {type:'draw', action:'accept'});
    };


    GameManager.prototype.cancelDraw = function(){
        if (!this.currentRoom){
            console.error('game_manager;', 'cancelDraw', 'game not started!');
            return
        }
        this.client.send('game_manager', 'event', 'server', {type:'draw', action:'cancel'});
    };


    GameManager.prototype.getPlayer = function(id){
        if (!this.currentRoom){
            console.error('game_manager;', 'getPlayer', 'game not started!');
            return
        }
        if (this.currentRoom)
            for (var i = 0; i < this.currentRoom.players.length; i++)
                if (this.currentRoom.players[i].userId == id) return this.currentRoom.players[i];
        return null;
    };


    GameManager.prototype.inGame = function (){
        return this.currentRoom != null && this.getPlayer(this.client.getPlayer().userId);
    };


    GameManager.prototype.onTimeTick = function(){
        var time = Date.now();
        if (!this.prevTime){
            this.prevTime = time;
            return;
        }
        var delta = time - this.prevTime;

        if (delta > 100) {
            this.currentRoom.userTime -= delta;
            if (this.currentRoom.userTime  < 0) {
                this.currentRoom.userTime = 0;
                //console.warn('gameManager;', 'user time is out', this.current, this.currentRoom);
            }
            this.emitTime();
            this.prevTime = time;
        }
    };


    GameManager.prototype.emitTime = function(){
        var minutes = Math.floor(this.currentRoom.userTime / 60000);
        var seconds = Math.floor((this.currentRoom.userTime - minutes * 60000) / 1000);
        if (minutes < 10) minutes = '0' + minutes;
        if (seconds < 10) seconds = '0' + seconds;

        this.emit('time',{
            user:this.currentRoom.current,
            userTimeMS: this.currentRoom.userTime,
            userTimeS: Math.floor(this.currentRoom.userTime/ 1000),
            userTimePer: this.currentRoom.userTime / this.client.opts.turnTime / 1000,
            userTimeFormat: minutes + ':' + seconds
        });
    };


    function Room(room, client){
        this.data = room;
        this.id = room.room;
        this.owner = client.getUser(room.owner);
        this.players = [];
        this.score = {games:0};
        if (typeof room.players[0] == "object") this.players = room.players;
        else for (var i = 0; i < room.players.length; i++) this.players.push(client.getUser(room.players[i]));
        for (var i = 0; i < this.players.length; i++){
            this.score[this.players[i].userId] = 0;
        }
    }

    return GameManager;
});
define('modules/invite_manager',['EE'], function(EE) {
    

    var InviteManager = function(client){
        var self = this;

        this.client = client;
        this.invites = {}; // userId : invite
        this.invite = null;

        client.userList.on('leave_user', function (user) {
            if (self.invite && self.invite.target == user.userId) {
                self.invite = null;
            }
            self.removeInvite(user.userId);
        });
        client.on('user_relogin', function (user) {
            if (self.invite && self.invite.target == user.userId) {
                self.invite = null;
                user.isInvited = false;
            }
            self.removeInvite(user.userId);
        });
        client.gameManager.on('game_start', function(){
            self.cancel();
            self.rejectAll();
            self.invite = null;
            self.isPlayRandom = false;
            self.client.viewsManager.userListView._setRandomPlay();
        });
        client.on('disconnected', function(){
            self.invite = null;
            for (var userId in self.invites)
                if (self.invites.hasOwnProperty(userId)){
                    self.removeInvite(userId);
                }
        });
    };

    InviteManager.prototype  = new EE();


    InviteManager.prototype.onMessage = function(message){
        console.log('invite_manager;', 'message', message);
        switch (message.type) {
            case 'invite': this.onInvite(message.data); break;
            case 'reject': this.onReject(message.data.target, message.data.from, 'rejected'); break;
            case 'cancel': this.onCancel(message.data); break;
        }
    };


    InviteManager.prototype.onInvite = function(invite){
        //TODO: CHECK INVITE AVAILABLE
        this.invites[invite.from] = invite;

        if (this.isPlayRandom && this.client.currentMode == invite.mode) {
            console.log('invite_manager;', 'auto accept invite', invite);
            this.accept(invite.from);
            return;
        }

        this.emit('new_invite', {
            from: this.client.getUser(invite.from),
            data: invite
        });
    };


    InviteManager.prototype.onReject = function(userId, senderId, reason){
        if (this.invite.target == userId && this.client.getPlayer().userId == senderId){
            this.emit('reject_invite', {user:this.client.userList.getUser(userId), reason:reason});
            this.invite = null;
        } else {
            console.warn('invite_manager; ', 'wrong user reject invite', userId, senderId);
        }
    };


    InviteManager.prototype.onCancel = function(invite){
        if (this.invites[invite.from]){
            this.emit('cancel_invite', this.invites[invite.from]);
            this.removeInvite(invite.from);
        }
    };


    InviteManager.prototype.sendInvite = function(userId, params) {
        // find user, get current params, send invite and emit event invite sand // params.gameType;
        if (this.client.gameManager.inGame()){
            console.warn('You are already in game!');
            return;
        }
        if (!userId){
            console.warn('invite_manager; ', 'wrong userId to send invite', userId);
            return;
        }
        if (this.invite){
            this.cancel();
        }
        params = params || {};
        if (params.mode){
            console.error('invite param mode is reserved!');
            return;
        }
        params.mode = this.client.currentMode;
        params.target = userId;
        this.invite = params;
        this.client.send('invite_manager', 'invite', userId, this.invite);
    };


    InviteManager.prototype.accept = function(userId){
        if (this.client.gameManager.inGame()){
            console.warn('You are already in game!');
            return;
        }
        if (this.invites[userId]){
            var invite = this.invites[userId];
            delete this.invites[userId];
            this.cancel();
            this.rejectAll();
            this.client.send('invite_manager', 'accept', userId, invite);
        }
    };


    InviteManager.prototype.reject = function(userId){
        if (this.invites[userId]){
            this.client.send('invite_manager', 'reject', userId, this.invites[userId]);
            this.removeInvite(userId);
        }
    };


    InviteManager.prototype.rejectAll = function() {
        for (var userId in this.invites)
            if (this.invites.hasOwnProperty(userId)){
                this.client.send('invite_manager', 'reject', userId, this.invites[userId]);
                this.removeInvite(userId);
            }
    };


    InviteManager.prototype.cancel = function(){
        if (this.invite) {
            this.client.send('invite_manager', 'cancel', this.invite.target, this.invite);
            this.invite = null;
        }
    };


    InviteManager.prototype.removeInvite = function(userId){
        console.log('invite_manger;', 'removeInvite', userId);
        if (this.invites[userId]){
            this.emit('remove_invite', this.invites[userId]);
            delete this.invites[userId];
        }
    };


    InviteManager.prototype.playRandom = function(cancel){
        if (this.client.gameManager.inGame()){
            console.warn('You are already in game!');
            return;
        }

        if (!cancel){
            for (var userId in this.invites){
                if (this.invites[userId].mode == this.client.currentMode){
                    console.log('invite_manager;', 'auto accept invite', this.invites[userId]);
                    this.accept(userId);
                    return;
                }

            }
            this.isPlayRandom = true;
            var params = this.client.opts.getUserParams == 'function'?this.client.opts.getUserParams():{};
            if (params.mode){
                console.error('invite param mode is reserved!');
                return;
            }
            params.mode = this.client.currentMode;
            this.client.send('invite_manager', 'random', 'server', params);
        } else {
            this.isPlayRandom = false;
            this.client.send('invite_manager', 'random', 'server', true);
        }
    };

    return InviteManager;
});
define('modules/user_list',['EE'], function(EE) {
    

    var UserList = function(client){

        var self = this;

        this.client = client;
        this.users = [];
        this.rooms = [];

        client.on('disconnected', function(){
            self.rooms = [];
            self.users = [];
        });
        client.gameManager.on('round_end', function(data){
            if (data.ratings && data.mode){
                for (var userId in data.ratings){
                    for (var i = 0; i < self.users.length; i++){
                        if(self.users[i].userId == userId) {
                            self.users[i][data.mode] = data.ratings[userId];
                        }
                    }
                }
                this.emit('update', data);
            }
        });
    };

    UserList.prototype  = new EE();


    UserList.prototype.onMessage = function(message){
        switch (message.type){
            case 'user_login': this.onUserLogin(message.data); break;
        }
    };


    UserList.prototype.onUserLogin = function(data, fIsPlayer){
        var user = new User(data, fIsPlayer, this.client);
        if (fIsPlayer) this.player = user;
        for (var i = 0; i < this.users.length; i++){
            if(this.users[i].userId == user.userId) {
                console.warn('user_list;', 'user already in list!', user);
                return false;
            }
        }
        this.users.push(user);
        this.emit('new_user', user);
    };


    UserList.prototype.onUserLeave = function(userId){
        for (var i = 0; i < this.users.length; i++) {
            if (this.users[i].userId == userId){
                var user = this.users[i];
                this.users.splice(i, 1);
                this.emit('leave_user', user);
                return;
            }
        }
        console.warn('user_list;', 'no user in list', userId);
    };


    UserList.prototype.onGameStart = function(roomId, players){
        for (var i = 0; i < players.length; i++){
            players[i] = this.getUser(players[i]);
            players[i].isInRoom = true;
        }
        var room = {
            room:roomId, players: players
        };
        this.rooms.push(room);
        this.emit('new_room',room);
    };


    UserList.prototype.onGameEnd = function(roomId, players){
        for (var i = 0; i < this.rooms.length; i++) {
            if (this.rooms[i].room == roomId){
                var room = this.rooms[i];
                this.rooms.splice(i, 1);
                for (var j = 0; j < room.players.length; j++){
                    room.players[j].isInRoom = false;
                }
                this.emit('close_room', room);
                return;
            }
        }
        console.warn('user_list;', 'no room in list', roomId, players);
    };


    UserList.prototype.getUser = function(id){
        for (var i = 0; i < this.users.length; i++)
            if (this.users[i].userId == id) return this.users[i];
        return null;
    };


    UserList.prototype.getUsers = function() {
        var invite = this.client.inviteManager.invite;
        if (invite) { // mark invited user
            return _.map(this.users, function(usr) {
                if (usr.userId === invite.target) {
                    usr.isInvited = true;
                }
                return usr;
            });
        } else {
            return this.users;
        }
    };


    UserList.prototype.getUserList = function() {
        var userList = [], invite = this.client.inviteManager.invite, user;
        for (var i = 0; i < this.users.length; i++){
            user = this.users[i];
            if (invite && user.userId == invite.target) { // user is invited
                user.isInvited = true;
            } else delete user.isInvited;
            if (!user.isInRoom) userList.push(user);
        }
        userList.sort(function(a, b){
            var ar = a.getRank();
            if (isNaN(+ar)) {
                ar = 99999999;
                if (a.isPlayer) {
                    ar = 10000000;
                }
            }
            var br = b.getRank();
            if (isNaN(+br)) {
                br = 99999999;
                if (b.isPlayer) {
                    br = 100000000;
                }
            }
            return +(ar >br)
        });
        return userList;
    };


    UserList.prototype.getFreeUserList = function() {
        var userList = [], invite = this.client.inviteManager.invite, user;
        for (var i = 0; i < this.users.length; i++){
            user = this.users[i];
            if (user.isPlayer){
                continue;
            }
            if (invite && user.userId == invite.target) { // user is invited
                continue;
            }
            if (user.isInRoom) {
                continue;
            }
            userList.push(user);
        }
        return userList;
    };


    UserList.prototype.getRoomList = function() {
        return this.rooms;
    };


    UserList.prototype.createUser = function(data) {
        if (!data.userId || !data.userName){
            console.error('user_list;', 'wrong data for User', data);
        }
        return new User(data, data.userId == this.player.userId, this.client);
    };


    function User(data, fIsPlayer, client){
        if (!data || !data.userId || !data.userName) throw new Error("wrong user data!");
        for (var key in data){
            if (data.hasOwnProperty(key)) this[key] = data[key];
        }
        this.isPlayer = fIsPlayer || false;
        this.getRank = function (mode) {
            return this[mode||this._client.currentMode].rank || '—';
        };
        this._client = client;
    }

    return UserList;
});
define('modules/socket',['EE'], function(EE) {
    

    var Socket = function(opts){
        opts = opts || {};
        this.port = opts.port||'8080';
        this.domain = opts.domain || document.domain;
        this.game = opts.game||"test";
        this.url = opts.url || this.game;
        this.https = opts.https || false;
        this.protocol = (this.https?'wss':'ws');

        this.isConnecting = true;
        this.isConnected = false;

    };

    Socket.prototype  = new EE();


    Socket.prototype.init = function(){
        var self = this;
        self.isConnecting = true;
        self.isConnected = false;

        try{

            this.ws = new WebSocket (this.protocol+'://'+this.domain+':'+this.port+'/'+this.url);

            this.ws.onclose = function (code, message) {
                console.log('socket;', 'ws closed', code, message);
                if (self.isConnected) self.onDisconnect();
            };

            this.ws.onerror = function (error) {
                self.onError(error);
            };

            this.ws.onmessage = function (data, flags) {

                if (data.data == 'ping') {
                    self.ws.send('pong');
                    return;
                }
                console.log('socket;', 'ws message', data, flags);
                try{
                    data = JSON.parse(data.data)
                } catch (e) {
                    console.log('socket;', 'ws wrong data in message', e);
                    return;
                }

                self.onMessage(data);
            };

            this.ws.onopen = function () {
                console.log('socket;', new Date(), 'ws open');
                self.onConnect();
            };

        } catch (error) {
            console.log('socket;', 'ws open error');
            this.onError(error);
        }


    };

    Socket.prototype.onError = function(error){
        console.log('socket;', 'ws error', error);
        if (this.isConnecting){
            this.isConnecting = false;
            console.log('socket;', "ws connection failed!");
            this.onConnectionFailed();
        }
    };


    Socket.prototype.onConnect = function(){
        this.isConnected = true;
        this.emit("connection");
    };


    Socket.prototype.onDisconnect = function(){
        this.isConnected = false;
        this.emit("disconnection")
    };


    Socket.prototype.onMessage = function(data){
        this.emit("message", data);
    };


    Socket.prototype.onConnectionFailed = function(){
        this.isConnecting = false;
        this.isConnected = false;
        this.emit("failed");
    };


    Socket.prototype.send = function (data) {
        try{
            data = JSON.stringify(data);
        } catch (error){
            console.warn('socket;', "json stringify err", data, error);
            return;
        }
        this.ws.send(data);
    };

    return Socket;
});
/**
 * @license RequireJS text 2.0.12 Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/requirejs/text for details
 */
/*jslint regexp: true */
/*global require, XMLHttpRequest, ActiveXObject,
  define, window, process, Packages,
  java, location, Components, FileUtils */

define('text',['module'], function (module) {
    

    var text, fs, Cc, Ci, xpcIsWindows,
        progIds = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'],
        xmlRegExp = /^\s*<\?xml(\s)+version=[\'\"](\d)*.(\d)*[\'\"](\s)*\?>/im,
        bodyRegExp = /<body[^>]*>\s*([\s\S]+)\s*<\/body>/im,
        hasLocation = typeof location !== 'undefined' && location.href,
        defaultProtocol = hasLocation && location.protocol && location.protocol.replace(/\:/, ''),
        defaultHostName = hasLocation && location.hostname,
        defaultPort = hasLocation && (location.port || undefined),
        buildMap = {},
        masterConfig = (module.config && module.config()) || {};

    text = {
        version: '2.0.12',

        strip: function (content) {
            //Strips <?xml ...?> declarations so that external SVG and XML
            //documents can be added to a document without worry. Also, if the string
            //is an HTML document, only the part inside the body tag is returned.
            if (content) {
                content = content.replace(xmlRegExp, "");
                var matches = content.match(bodyRegExp);
                if (matches) {
                    content = matches[1];
                }
            } else {
                content = "";
            }
            return content;
        },

        jsEscape: function (content) {
            return content.replace(/(['\\])/g, '\\$1')
                .replace(/[\f]/g, "\\f")
                .replace(/[\b]/g, "\\b")
                .replace(/[\n]/g, "\\n")
                .replace(/[\t]/g, "\\t")
                .replace(/[\r]/g, "\\r")
                .replace(/[\u2028]/g, "\\u2028")
                .replace(/[\u2029]/g, "\\u2029");
        },

        createXhr: masterConfig.createXhr || function () {
            //Would love to dump the ActiveX crap in here. Need IE 6 to die first.
            var xhr, i, progId;
            if (typeof XMLHttpRequest !== "undefined") {
                return new XMLHttpRequest();
            } else if (typeof ActiveXObject !== "undefined") {
                for (i = 0; i < 3; i += 1) {
                    progId = progIds[i];
                    try {
                        xhr = new ActiveXObject(progId);
                    } catch (e) {}

                    if (xhr) {
                        progIds = [progId];  // so faster next time
                        break;
                    }
                }
            }

            return xhr;
        },

        /**
         * Parses a resource name into its component parts. Resource names
         * look like: module/name.ext!strip, where the !strip part is
         * optional.
         * @param {String} name the resource name
         * @returns {Object} with properties "moduleName", "ext" and "strip"
         * where strip is a boolean.
         */
        parseName: function (name) {
            var modName, ext, temp,
                strip = false,
                index = name.indexOf("."),
                isRelative = name.indexOf('./') === 0 ||
                             name.indexOf('../') === 0;

            if (index !== -1 && (!isRelative || index > 1)) {
                modName = name.substring(0, index);
                ext = name.substring(index + 1, name.length);
            } else {
                modName = name;
            }

            temp = ext || modName;
            index = temp.indexOf("!");
            if (index !== -1) {
                //Pull off the strip arg.
                strip = temp.substring(index + 1) === "strip";
                temp = temp.substring(0, index);
                if (ext) {
                    ext = temp;
                } else {
                    modName = temp;
                }
            }

            return {
                moduleName: modName,
                ext: ext,
                strip: strip
            };
        },

        xdRegExp: /^((\w+)\:)?\/\/([^\/\\]+)/,

        /**
         * Is an URL on another domain. Only works for browser use, returns
         * false in non-browser environments. Only used to know if an
         * optimized .js version of a text resource should be loaded
         * instead.
         * @param {String} url
         * @returns Boolean
         */
        useXhr: function (url, protocol, hostname, port) {
            var uProtocol, uHostName, uPort,
                match = text.xdRegExp.exec(url);
            if (!match) {
                return true;
            }
            uProtocol = match[2];
            uHostName = match[3];

            uHostName = uHostName.split(':');
            uPort = uHostName[1];
            uHostName = uHostName[0];

            return (!uProtocol || uProtocol === protocol) &&
                   (!uHostName || uHostName.toLowerCase() === hostname.toLowerCase()) &&
                   ((!uPort && !uHostName) || uPort === port);
        },

        finishLoad: function (name, strip, content, onLoad) {
            content = strip ? text.strip(content) : content;
            if (masterConfig.isBuild) {
                buildMap[name] = content;
            }
            onLoad(content);
        },

        load: function (name, req, onLoad, config) {
            //Name has format: some.module.filext!strip
            //The strip part is optional.
            //if strip is present, then that means only get the string contents
            //inside a body tag in an HTML string. For XML/SVG content it means
            //removing the <?xml ...?> declarations so the content can be inserted
            //into the current doc without problems.

            // Do not bother with the work if a build and text will
            // not be inlined.
            if (config && config.isBuild && !config.inlineText) {
                onLoad();
                return;
            }

            masterConfig.isBuild = config && config.isBuild;

            var parsed = text.parseName(name),
                nonStripName = parsed.moduleName +
                    (parsed.ext ? '.' + parsed.ext : ''),
                url = req.toUrl(nonStripName),
                useXhr = (masterConfig.useXhr) ||
                         text.useXhr;

            // Do not load if it is an empty: url
            if (url.indexOf('empty:') === 0) {
                onLoad();
                return;
            }

            //Load the text. Use XHR if possible and in a browser.
            if (!hasLocation || useXhr(url, defaultProtocol, defaultHostName, defaultPort)) {
                text.get(url, function (content) {
                    text.finishLoad(name, parsed.strip, content, onLoad);
                }, function (err) {
                    if (onLoad.error) {
                        onLoad.error(err);
                    }
                });
            } else {
                //Need to fetch the resource across domains. Assume
                //the resource has been optimized into a JS module. Fetch
                //by the module name + extension, but do not include the
                //!strip part to avoid file system issues.
                req([nonStripName], function (content) {
                    text.finishLoad(parsed.moduleName + '.' + parsed.ext,
                                    parsed.strip, content, onLoad);
                });
            }
        },

        write: function (pluginName, moduleName, write, config) {
            if (buildMap.hasOwnProperty(moduleName)) {
                var content = text.jsEscape(buildMap[moduleName]);
                write.asModule(pluginName + "!" + moduleName,
                               "define(function () { return '" +
                                   content +
                               "';});\n");
            }
        },

        writeFile: function (pluginName, moduleName, req, write, config) {
            var parsed = text.parseName(moduleName),
                extPart = parsed.ext ? '.' + parsed.ext : '',
                nonStripName = parsed.moduleName + extPart,
                //Use a '.js' file name so that it indicates it is a
                //script that can be loaded across domains.
                fileName = req.toUrl(parsed.moduleName + extPart) + '.js';

            //Leverage own load() method to load plugin value, but only
            //write out values that do not have the strip argument,
            //to avoid any potential issues with ! in file names.
            text.load(nonStripName, req, function (value) {
                //Use own write() method to construct full module value.
                //But need to create shell that translates writeFile's
                //write() to the right interface.
                var textWrite = function (contents) {
                    return write(fileName, contents);
                };
                textWrite.asModule = function (moduleName, contents) {
                    return write.asModule(moduleName, fileName, contents);
                };

                text.write(pluginName, nonStripName, textWrite, config);
            }, config);
        }
    };

    if (masterConfig.env === 'node' || (!masterConfig.env &&
            typeof process !== "undefined" &&
            process.versions &&
            !!process.versions.node &&
            !process.versions['node-webkit'])) {
        //Using special require.nodeRequire, something added by r.js.
        fs = require.nodeRequire('fs');

        text.get = function (url, callback, errback) {
            try {
                var file = fs.readFileSync(url, 'utf8');
                //Remove BOM (Byte Mark Order) from utf8 files if it is there.
                if (file.indexOf('\uFEFF') === 0) {
                    file = file.substring(1);
                }
                callback(file);
            } catch (e) {
                if (errback) {
                    errback(e);
                }
            }
        };
    } else if (masterConfig.env === 'xhr' || (!masterConfig.env &&
            text.createXhr())) {
        text.get = function (url, callback, errback, headers) {
            var xhr = text.createXhr(), header;
            xhr.open('GET', url, true);

            //Allow plugins direct access to xhr headers
            if (headers) {
                for (header in headers) {
                    if (headers.hasOwnProperty(header)) {
                        xhr.setRequestHeader(header.toLowerCase(), headers[header]);
                    }
                }
            }

            //Allow overrides specified in config
            if (masterConfig.onXhr) {
                masterConfig.onXhr(xhr, url);
            }

            xhr.onreadystatechange = function (evt) {
                var status, err;
                //Do not explicitly handle errors, those should be
                //visible via console output in the browser.
                if (xhr.readyState === 4) {
                    status = xhr.status || 0;
                    if (status > 399 && status < 600) {
                        //An http 4xx or 5xx error. Signal an error.
                        err = new Error(url + ' HTTP status: ' + status);
                        err.xhr = xhr;
                        if (errback) {
                            errback(err);
                        }
                    } else {
                        callback(xhr.responseText);
                    }

                    if (masterConfig.onXhrComplete) {
                        masterConfig.onXhrComplete(xhr, url);
                    }
                }
            };
            xhr.send(null);
        };
    } else if (masterConfig.env === 'rhino' || (!masterConfig.env &&
            typeof Packages !== 'undefined' && typeof java !== 'undefined')) {
        //Why Java, why is this so awkward?
        text.get = function (url, callback) {
            var stringBuffer, line,
                encoding = "utf-8",
                file = new java.io.File(url),
                lineSeparator = java.lang.System.getProperty("line.separator"),
                input = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(file), encoding)),
                content = '';
            try {
                stringBuffer = new java.lang.StringBuffer();
                line = input.readLine();

                // Byte Order Mark (BOM) - The Unicode Standard, version 3.0, page 324
                // http://www.unicode.org/faq/utf_bom.html

                // Note that when we use utf-8, the BOM should appear as "EF BB BF", but it doesn't due to this bug in the JDK:
                // http://bugs.sun.com/bugdatabase/view_bug.do?bug_id=4508058
                if (line && line.length() && line.charAt(0) === 0xfeff) {
                    // Eat the BOM, since we've already found the encoding on this file,
                    // and we plan to concatenating this buffer with others; the BOM should
                    // only appear at the top of a file.
                    line = line.substring(1);
                }

                if (line !== null) {
                    stringBuffer.append(line);
                }

                while ((line = input.readLine()) !== null) {
                    stringBuffer.append(lineSeparator);
                    stringBuffer.append(line);
                }
                //Make sure we return a JavaScript string and not a Java string.
                content = String(stringBuffer.toString()); //String
            } finally {
                input.close();
            }
            callback(content);
        };
    } else if (masterConfig.env === 'xpconnect' || (!masterConfig.env &&
            typeof Components !== 'undefined' && Components.classes &&
            Components.interfaces)) {
        //Avert your gaze!
        Cc = Components.classes;
        Ci = Components.interfaces;
        Components.utils['import']('resource://gre/modules/FileUtils.jsm');
        xpcIsWindows = ('@mozilla.org/windows-registry-key;1' in Cc);

        text.get = function (url, callback) {
            var inStream, convertStream, fileObj,
                readData = {};

            if (xpcIsWindows) {
                url = url.replace(/\//g, '\\');
            }

            fileObj = new FileUtils.File(url);

            //XPCOM, you so crazy
            try {
                inStream = Cc['@mozilla.org/network/file-input-stream;1']
                           .createInstance(Ci.nsIFileInputStream);
                inStream.init(fileObj, 1, 0, false);

                convertStream = Cc['@mozilla.org/intl/converter-input-stream;1']
                                .createInstance(Ci.nsIConverterInputStream);
                convertStream.init(inStream, "utf-8", inStream.available(),
                Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

                convertStream.readString(inStream.available(), readData);
                convertStream.close();
                inStream.close();
                callback(readData.value);
            } catch (e) {
                throw new Error((fileObj && fileObj.path || '') + ': ' + e);
            }
        };
    }
    return text;
});


define('text!tpls/userListFree.ejs',[],function () { return '<% _.each(users, function(user) { %>\r\n<tr class="userListFree">\r\n    <td class="userName" data-userId="<%= user.userId %>" title="<%= user.userName %>"><%= user.userName %></td>\r\n    <td class="userRank"><%= user.getRank() %></td>\r\n    <% if (user.isPlayer) { %>\r\n    <td></td>\r\n    <% } else if (user.isInvited) { %>\r\n    <td class="inviteBtn activeInviteBtn" data-userId="<%= user.userId %>">Отмена</td>\r\n    <% } else { %>\r\n    <td class="inviteBtn" data-userId="<%= user.userId %>">Пригласить</td>\r\n    <% } %>\r\n\r\n</tr>\r\n\r\n<% }) %>';});


define('text!tpls/userListInGame.ejs',[],function () { return '<% _.each(rooms, function(room) { %>\r\n<tr class="userListGame" data-id="<%= room.room %>">\r\n    <td class="userName" title="<%= room.players[0].userName + \' (\' +  room.players[0].getRank(room.mode) + \')\' %>" ><%= room.players[0].userName %></td>\r\n    <td>:</td>\r\n    <td class="userName" title="<%= room.players[1].userName + \' (\' +  room.players[1].getRank(room.mode) + \')\' %>" ><%= room.players[1].userName %></td>\r\n</tr>\r\n<% }) %>';});


define('text!tpls/userListMain.ejs',[],function () { return '<div class="tabs">\r\n    <div data-type="free">Свободны <span></span></div>\r\n    <div data-type="inGame">Играют <span></span></div>\r\n</div>\r\n<div id="userListSearch">\r\n    <label for="userListSearch">Поиск по списку:</label><input type="text" id="userListSearch"/>\r\n</div>\r\n<div class="tableWrap">\r\n    <table cellspacing="0" class="playerList"></table>\r\n</div>\r\n\r\n<div class="btn" id="randomPlay">\r\n    <span>Играть с любым</span>\r\n</div>';});

define('views/user_list',['underscore', 'backbone', 'text!tpls/userListFree.ejs', 'text!tpls/userListInGame.ejs', 'text!tpls/userListMain.ejs'],
    function(_, Backbone, tplFree, tplInGame, tplMain) {
    
    var UserListView = Backbone.View.extend({
        tagName: 'div',
        id: 'userList',
        tplFree: _.template(tplFree),
        tplInGame: _.template(tplInGame),
        tplMain: _.template(tplMain),
        events: {
            'click .inviteBtn': '_inviteBtnClicked',
            'click .userName': 'userClick',
            'click .tabs div': 'clickTab',
            'click .disconnectButton': '_reconnect',
            'click #randomPlay': 'playClicked'
        },
        _reconnect: function() {
            if (this.client.opts.reload) {
                location.reload(false);
                return;
            }
            this.$list.html(this.$loadingTab);
            this.client.socket.init();
        },
        clickTab: function(e) {
            if (!this.client.socket.isConnected) {
                return;
            }

            var target = $(e.currentTarget),
                clickedTabName = target.attr('data-type');

            if (clickedTabName === this.currentActiveTabName) {
                return;
            }

            this.currentActiveTabName = clickedTabName;
            this._setActiveTab(this.currentActiveTabName);
            this.render();
        },
        userClick: function(e) {
            var target = $(e.currentTarget),
                userId = target.attr('data-userId');
            this.client.onShowProfile(userId);
        },
        _inviteBtnClicked: function(e) {
            var target = $(e.currentTarget),
                userId = target.attr('data-userId');
            this.invitePlayer(userId)
        },
        invitePlayer: function(userId) {
            if (this.client.gameManager.inGame()) {
                console.warn('You are already in game!');
                return;
            }

            var target = this.$el.find('.inviteBtn[data-userId="' + userId + '"]');

            if (target.hasClass(this.ACTIVE_INVITE_CLASS)) {
                // cancel invite
                this.client.inviteManager.cancel();
                target.removeClass(this.ACTIVE_INVITE_CLASS);
                target.html('Пригласить');
            } else {
                // send invite
                this.$el.find('.' + this.ACTIVE_INVITE_CLASS).html('Пригласить').removeClass(this.ACTIVE_INVITE_CLASS);
                this.client.inviteManager.sendInvite(userId, (typeof this.client.opts.getUserParams == 'function'?this.client.opts.getUserParams():{}));
                target.addClass(this.ACTIVE_INVITE_CLASS);
                target.html('Отмена');
            }

            console.log('invite user', userId);
        },
        playClicked: function (e) {
            this.client.inviteManager.playRandom(this.client.inviteManager.isPlayRandom);
            this._setRandomPlay();
        },
        initialize: function(_client) {
            var bindedRender = this.render.bind(this);

            this.client = _client;

            this.$disconnectedTab = $('<tr class="disconnected"><td><div>' +
                '<span class="disconnectText">Соединение с сервером отсутствует</span>' +
                '<br>' +
                '<br>' +
                '<span class="disconnectButton">Переподключиться</span>' +
                '</div></td></tr>');
            this.$loadingTab = $('<tr><td>Загрузка..</td></tr>');
            this.$el.html(this.tplMain());
            // append user list
            if (_client.opts.blocks.userListId)
                $('#'+_client.opts.blocks.userListId).append(this.el);
            else
                $('body').append(this.el);

            this.ACTIVE_INVITE_CLASS = 'activeInviteBtn';
            this.ACTIVE_TAB_CLASS = 'activeTab';

            this.TEXT_PLAY_ACTIVE = 'Идет подбор игрока...';
            this.TEXT_PLAY_UNACTIVE = 'Играть с любым';

            this.$list = this.$el.find('.tableWrap table');
            this.$counterFree = this.$el.find('.tabs div[data-type="free"]').find('span');
            this.$counterinGame = this.$el.find('.tabs div[data-type="inGame"]').find('span');
            this.$btnPlay = this.$el.find('#randomPlay');

            this.listenTo(this.client.userList, 'new_user', bindedRender);
            this.listenTo(this.client, 'mode_switch', bindedRender);
            this.listenTo(this.client.userList, 'update', bindedRender);
            this.listenTo(this.client.userList, 'leave_user', bindedRender);
            this.listenTo(this.client.inviteManager, 'reject_invite', this.onRejectInvite.bind(this));
            this.listenTo(this.client.userList, 'new_room', bindedRender);
            this.listenTo(this.client.userList, 'close_room', bindedRender);
            this.listenTo(this.client, 'disconnected', bindedRender);
            this.listenTo(this.client, 'user_relogin', bindedRender);

            this.currentActiveTabName = 'free';
            this._setActiveTab(this.currentActiveTabName);
            this.$list.html(this.$loadingTab);
            this.randomPlay = false;
        },
        _setRandomPlay: function(){
            if (this.client.inviteManager.isPlayRandom) {
                this.$btnPlay.html(this.TEXT_PLAY_ACTIVE);
                this.$btnPlay.addClass('active');
            } else {
                this.$btnPlay.html(this.TEXT_PLAY_UNACTIVE);
                this.$btnPlay.removeClass('active');
            }
        },
        _setActiveTab: function(tabName) {
            this.$el.find('.tabs div').removeClass(this.ACTIVE_TAB_CLASS);
            this.$el.find('.tabs div[data-type="' + tabName + '"]').addClass(this.ACTIVE_TAB_CLASS);
        },
        _setCounters: function() {
            if (!this.client.socket.isConnected) {
                this.$counterFree.html('');
                this.$counterinGame.html('');
                return;
            }

            this.$counterFree.html('(' + this.client.userList.getUserList().length + ')');
            this.$counterinGame.html('(' + this.client.userList.getRoomList().length * 2 + ')');
        },
        _showPlayerListByTabName: function() {
            // default

            if (!this.client.socket.isConnected) {
                this.$list.html(this.$disconnectedTab);
                return;
            }

            if (this.currentActiveTabName === 'free') {
                this.$list.html(this.tplFree({
                    users: this.client.userList.getUserList()
                }));
            }
            else if (this.currentActiveTabName === 'inGame') {
                this.$list.html(this.tplInGame({
                    rooms: this.client.userList.getRoomList()
                }));
            } else {
                console.warn('unknown tab', this.currentActiveTabName);
            }
        },
        onRejectInvite: function(invite) {
            this.$el.find('.' + this.ACTIVE_INVITE_CLASS + '[data-userId="' + invite.user.userId + '"]').html('Пригласить').removeClass(this.ACTIVE_INVITE_CLASS);
        },
        render: function() {
            if (this.client.unload) return;
            setTimeout(this._showPlayerListByTabName.bind(this),1);
            this._setCounters();
            return this;
        }
    });
    return UserListView;
});
define('views/dialogs',[],function() {
    
    var dialogs = (function() {
        var NOTIFICATION_CLASS = 'dialogNotification';
        var INVITE_CLASS = 'dialogInvite';
        var USERLEAVE_CLASS = 'dialogUserLeave';
        var ROUNDRESULT_CLASS = 'dialogRoundResult';
        var client;
        var dialogTimeout;

        function _subscribe(_client) {
            client = _client;
            client.inviteManager.on('new_invite', _newInvite);
            client.inviteManager.on('reject_invite', _rejectInvite);
            client.inviteManager.on('cancel_invite', _cancelInvite);
            client.inviteManager.on('remove_invite', _removeInvite);
            client.gameManager.on('user_leave', _userLeave);
            client.gameManager.on('game_start', _hideDialogs);
            client.gameManager.on('round_end', _roundEnd);
            client.gameManager.on('game_leave', _hideDialogs);
            client.gameManager.on('ask_draw', _askDraw);
            client.gameManager.on('cancel_draw', _cancelDraw);
            client.chatManager.on('show_ban', _showBan);
            client.on('login_error', _loginError);
        }

        function _newInvite(invite) {
            var div = $('<div>');
            div.addClass(INVITE_CLASS);
            div.attr('data-userId', invite.from.userId);
            var text = 'Вас пригласил в игру пользователь ' + invite.from.userName;
            if (typeof this.client.opts.generateInviteText == "function")
                text = this.client.opts.generateInviteText(invite);
            div.html(text).dialog({
                resizable: true,
                draggable: false,
                modal: false,
                buttons: {
                    "Принять": function() {
                        client.inviteManager.accept($(this).attr('data-userId'));
                        $(this).remove();
                    },
                    "Отклонить": function(){
                        client.inviteManager.reject($(this).attr('data-userId'));
                        $(this).remove();
                    }
                },
                close: function() {
                    client.inviteManager.reject($(this).attr('data-userId'));
                    $(this).remove();
                }
            }).parent().draggable();
        }

        function _rejectInvite(invite) {
            var div = $('<div>');
            div.addClass(INVITE_CLASS);
            div.addClass(NOTIFICATION_CLASS);

            div.html('Пользователь ' + invite.user.userName + ' отклонил ваше приглашение').dialog({
                resizable: false,
                modal: false,
                buttons: {
                    "Ок": function() {
                        $(this).remove();
                    }
                }
            });
        }

        function _cancelInvite(opt) {
            console.log('cancel invite', opt);
        }

        function _removeInvite(invite) {
            var userId = invite.from;
            console.log('remove invite', userId);
            $('.' + INVITE_CLASS + '[data-userId="' + userId + '"]').remove();
        }

        function _userLeave(user) {
            _hideDialogs();

            var div = $('<div>');
            div.addClass(INVITE_CLASS);
            div.addClass(NOTIFICATION_CLASS);

            div.html('Пользователь ' + user.userName + ' покинул игру').dialog({
                resizable: false,
                modal: false,
                buttons: {
                    "Ок": function() {
                        $(this).remove();
                        client.gameManager.leaveRoom();
                    }
                }
            });
        }

        function _askDraw(user) {
            console.log('ask draw', user);
            var div = $('<div>');
            div.addClass(NOTIFICATION_CLASS);

            div.html('Пользователь ' + user.userName + ' предлагает ничью').dialog({
                resizable: false,
                modal: false,
                buttons: {
                    "Принять": function() {
                        client.gameManager.acceptDraw();
                        $(this).remove();
                    },
                    "Отклонить": function() {
                        client.gameManager.cancelDraw();
                        $(this).remove();
                    }
                },
                close: function() {
                    client.gameManager.cancelDraw();
                    $(this).remove();
                }
            }).parent().draggable();
        }

        function _cancelDraw(user) {
            console.log('cancel draw', user);
            var div = $('<div>');
            div.addClass(NOTIFICATION_CLASS);

            div.html('Пользователь ' + user.userName + ' отклонил ваше предложение о ничье').dialog({
                resizable: false,
                modal: false,
                buttons: {
                    "Ок": function() {
                        $(this).remove();
                    }
                }
            });
        }

        function _roundEnd(data) {
            _hideDialogs();

            var div = $('<div>');
            div.addClass(ROUNDRESULT_CLASS);

            var result = "";
            switch (data.result){
                case 'win': result = 'Победа'; break;
                case 'lose': result = 'Поражение'; break;
                case 'draw': result = 'Ничья'; break;
                default : result = 'игра окночена';
            }
            // TODO: get opponent name;

            dialogTimeout = setTimeout(function(){
                div.html(result + '<br><br> Сыграть с соперником еще раз?').dialog({
                    resizable: false,
                    modal: false,
                    width: 350,
                    buttons: {
                        "Да, начать новую игру": function() {
                            $(this).remove();
                            client.gameManager.sendReady();
                        },
                        "Нет, выйти": function() {
                            $(this).remove();
                            client.gameManager.leaveGame();
                        }
                    },
                    close: function() {
                        $(this).remove();
                        client.gameManager.leaveGame();
                    }
                });
            }, client.opts.resultDialogDelay);

        }

        function _loginError() {
            var div = $('<div>');
            div.addClass(NOTIFICATION_CLASS);

            div.html('Ошибка авторизации. Обновите страницу').dialog({
                resizable: false,
                modal: false,
                buttons: {
                    "Ок": function() {
                        $(this).remove();
                    }
                }
            });
        }

        function _showBan(ban) {
            var div = $('<div>');
            div.addClass(NOTIFICATION_CLASS);
            var html = 'Вы не можете писать сообщения в чате, т.к. добавлены в черный список ';
            if (ban.reason && ban.reason != '') html += 'за ' + ban.reason;
            else html += 'за употребление нецензурных выражений и/или спам ';
            if (ban.timeEnd) {
                html += (ban.timeEnd > 2280000000000 ? ' навсегда' : ' до ' + formatDate(ban.timeEnd));
            }
            div.html(html).dialog({
                resizable: false,
                modal: false,
                buttons: {
                    "Ок": function() {
                        $(this).remove();
                    }
                }
            });
        }

        function _hideDialogs() { //TODO: hide all dialogs and messages
            $('.' + NOTIFICATION_CLASS).remove();
            $('.' + ROUNDRESULT_CLASS).remove();
            $('.' + INVITE_CLASS).remove();
            clearTimeout(dialogTimeout);
        }

        function formatDate(time) {
            var date = new Date(time);
            var day = date.getDate();
            var month = date.getMonth() + 1;
            var year = ("" + date.getFullYear()).substr(2, 2);
            return ext(day, 2, "0") + "." + ext(month, 2, "0") + "."  + year;
            function ext(str, len, char) {
                //char = typeof (char) == "undefined" ? "&nbsp;" : char;
                str = "" + str;
                while (str.length < len) {
                    str = char + str;
                }
                return str;
            }
        }

        return {
            init: _subscribe
        };
    }());

    return dialogs;
});


define('text!tpls/v6-chatMain.ejs',[],function () { return '<div class="tabs">\r\n    <div class="tab" data-type="public">Общий чат</div>\r\n    <div class="tab" data-type="private" style="display: none;">игрок</div>\r\n</div>\r\n<div class="clear"></div>\r\n<div class="messagesWrap"><ul></ul></div>\r\n<div class="inputMsg" contenteditable="true"></div>\r\n<div class="layer1">\r\n    <div class="sendMsgBtn">Отправить</div>\r\n    <select id="chat-select">\r\n        <option selected>Готовые сообщения</option>\r\n        <option>Привет!</option>\r\n        <option>Молодец!</option>\r\n        <option>Здесь кто-нибудь умеет играть?</option>\r\n        <option>Кто со мной?</option>\r\n        <option>Спасибо!</option>\r\n        <option>Спасибо! Интересная игра!</option>\r\n        <option>Спасибо, больше играть не могу. Ухожу!</option>\r\n        <option>Спасибо, интересная игра! Сдаюсь!</option>\r\n        <option>Отличная партия. Спасибо!</option>\r\n        <option>Ты мог выиграть</option>\r\n        <option>Ты могла выиграть</option>\r\n        <option>Ходи!</option>\r\n        <option>Дай ссылку на твою страницу вконтакте</option>\r\n        <option>Снимаю шляпу!</option>\r\n        <option>Красиво!</option>\r\n        <option>Я восхищен!</option>\r\n        <option>Где вы так научились играть?</option>\r\n        <option>Еще увидимся!</option>\r\n        <option>Ухожу после этой партии. Спасибо!</option>\r\n        <option>Минуточку</option>\r\n    </select>\r\n</div>\r\n<div class="layer2">\r\n    <span class="chatAdmin">\r\n        <input type="checkbox" id="chatIsAdmin"/><label for="chatIsAdmin">От админа</label>\r\n    </span>\r\n\r\n    <span class="chatRules">Правила чата</span>\r\n</div>\r\n\r\n<ul class="menuElement noselect">\r\n    <li data-action="invite"><span>Пригласить в игру</span></li>\r\n    <li data-action="showProfile"><span>Показать профиль</span></li>\r\n    <li data-action="ban"><span>Забанить в чате</span></li>\r\n</ul>';});


define('text!tpls/v6-chatMsg.ejs',[],function () { return '<li class="chatMsg" data-msgId="<%= msg.time %>">\r\n    <div class="msgRow1">\r\n        <div class="smallRight time"><%= msg.t %></div>\r\n        <div class="smallRight rate"><%= (msg.rank || \'—\') %></div>\r\n        <div class="chatUserName" data-userId="<%= msg.userId%>" title="<%= msg.userName %>">\r\n            <span class="userName"><%= msg.userName %></span>\r\n        </div>\r\n    </div>\r\n    <div class="msgRow2">\r\n        <div class="delete" title="Удалить сообщение" style="background-image: url(<%= imgDel %>);"></div>\r\n        <div class="msgTextWrap">\r\n            <span class="v6-msgText"><%= _.escape(msg.text) %></span>\r\n        </div>\r\n    </div>\r\n</li>';});


define('text!tpls/v6-chatDay.ejs',[],function () { return '<li class="chatDay" data-day-msgId="<%= time %>">\r\n    <div>\r\n        <%= d %>\r\n    </div>\r\n</li>';});


define('text!tpls/v6-chatRules.ejs',[],function () { return '<div id="chat-rules" class="aboutPanel">\r\n    <img class="closeIcon" src="<%= close %>">\r\n\r\n    <div style="padding: 10px 12px 15px 25px;">\r\n        <h2>Правила чата</h2>\r\n        <p style="line-height: 16px;">В чате запрещено:<br>\r\n            <span style="margin-left:5px;">1. использование ненормативной лексики и оскорбительных выражений</span><br>\r\n            <span style="margin-left:5px;">2. хамское и некорректное общение с другими участниками</span><br>\r\n            <span style="margin-left:5px;">3. многократная публикация бессмысленных, несодержательных или одинаковых сообщений.</span>\r\n        </p>\r\n\r\n        <p style="line-height: 16px;"><span style="margin-left:5px;">Баны</span> выносятся: на 1 день, на 3 дня, на 7 дней,на\r\n            месяц или навсегда, в зависимости от степени тяжести нарушения.\r\n        </p>\r\n\r\n        <p style="line-height: 16px;"><span style="margin-left:5px;">Бан</span> снимается автоматически по истечении срока.\r\n        </p>\r\n\r\n    </div>\r\n</div>';});


define('text!tpls/v6-chatBan.ejs',[],function () { return '<div>\r\n    <span class="ban-username" style="font-weight:bold;">Бан игрока <i><%= userName%></i></span><br><br>\r\n    <span>Причина бана:</span>\r\n    <br>\r\n    <div class="inputTextField" id="ban-reason" contenteditable="true" style="height:54px; border: 1px solid #aaaaaa;"></div><br>\r\n\r\n    <span>Длительность бана:</span><br>\r\n    <select id="ban-duration">\r\n        <option value="1">1 день</option>\r\n        <option value="3">3 дня</option>\r\n        <option value="7" selected="">7 дней</option>\r\n        <option value="30">30 дней</option>\r\n        <option value="9999">Навсегда</option>\r\n    </select>\r\n\r\n</div>';});

define('views/chat',['underscore', 'backbone', 'text!tpls/v6-chatMain.ejs', 'text!tpls/v6-chatMsg.ejs', 'text!tpls/v6-chatDay.ejs', 'text!tpls/v6-chatRules.ejs', 'text!tpls/v6-chatBan.ejs'],
    function(_, Backbone, tplMain, tplMsg, tplDay, tplRules, tplBan) {
        

        var ChatView = Backbone.View.extend({
            tagName: 'div',
            id: 'v6Chat',
            tplMain: _.template(tplMain),
            tplMsg: _.template(tplMsg),
            tplDay: _.template(tplDay),
            tplRules: _.template(tplRules),
            tplBan: _.template(tplBan),
            events: {
                'click .chatMsg': '_deleteMsg',
                'click .tab': 'clickTab',
                'blur .inputMsg': 'blurInputMsg',
                'click .inputMsg': 'clickInputMsg',
                'click .sendMsgBtn': 'sendMsgEvent',
                'keyup .inputMsg': 'sendMsgEvent',
                'change #chat-select': 'changeChatSelect',
                'click .chatMsg div[data-userid]': 'showMenu',
                'click li[data-action]': 'clickDialogAction',
                'click .chatRules': 'showChatRules'
            },

            banUser: function(userId, userName){
                var mng =  this.client.chatManager;
                var div = $(this.tplBan({userName: userName})).attr('data-userId', userId).dialog({
                    buttons: {
                        "Добавить в бан": function() {
                           mng.banUser($(this).attr('data-userId'),$(this).find('#ban-duration')[0].value, $(this).find('#ban-reason').html());
                            $(this).remove();
                        },
                        "Отмена": function(){
                            $(this).remove();
                        }
                    },
                    close: function() {
                        $(this).remove();
                    }
                }).parent().draggable();
            },

            showChatRules: function() {
                this.$rules.css({
                    top: ($(window).height() / 2) - (this.$rules.outerHeight() / 2),
                    left: ($(window).width() / 2) - (this.$rules.outerWidth() / 2)
                }).show();
            },

            clickDialogAction: function(e) {
                var actionObj = {
                    action: $(e.currentTarget).attr('data-action'),
                    userId: this.$menu.attr('data-userId'),
                    userName: this.$menu.attr('data-userName')
                };

                switch (actionObj.action){
                    case 'showProfile': this.client.onShowProfile(actionObj.userId, actionObj.userName); break;
                    case 'invite': this.client.viewsManager.userListView.invitePlayer(actionObj.userId); break;
                    case 'ban': this.banUser(actionObj.userId, actionObj.userName); break;
                }
            },

            showMenu: function(e) {
                // клик на window.body сработает раньше, поэтому сдесь даже не нужно вызывать $menu.hide()
                var coords = e.target.getBoundingClientRect(),
                    OFFSET = 20, // отступ, чтобы не закрывало имя
                    userId = $(e.target).parent().attr('data-userid');

                setTimeout(function() {
                    this.$menu.find('li[data-action=invite]').hide();
                    if (!this.client.gameManager.inGame()) {                // show invite user, if we can
                        var userlist = this.client.userList.getFreeUserList();
                        if (userlist) {                                     // check user is free
                            for (var i = 0; i < userlist.length; i++){
                                if (userlist[i].userId == userId){
                                    this.$menu.find('li[data-action=invite]').show();
                                }
                            }
                        }
                    }

                    this.$menu.attr('data-userId', userId);
                    this.$menu.attr('data-userName', $(e.target).html());
                    this.$menu.css({
                        left: OFFSET, // фиксированный отступ слева
                        top: coords.top - document.getElementById('v6Chat').getBoundingClientRect().top + OFFSET
                    }).slideDown();
                }.bind(this), 0);

            },

            hideMenuElement: function() {
                this.$menu.removeAttr('data-userId');
                this.$menu.hide();
            },

            changeChatSelect: function(e) {
                var textMsg = e.target.options[e.target.selectedIndex].innerHTML;
                this.$SELECTED_OPTION.attr('selected', true);
                this.$inputMsg.text(textMsg);
            },

            sendMsgEvent: function(e) {
                // e используется здесь только если нажат enter
                if (e.type === 'keyup' && e.keyCode !== 13) {
                    return;
                }

                if (this.$inputMsg.has(this.$placeHolderSpan).length) {
                    return;
                }

                this._sendMsg(this.$inputMsg.text());
            },

            scrollEvent: function() {
                if (this.$messagesWrap[0].scrollHeight - this.$messagesWrap.height() != 0 &&
                this.$messagesWrap.scrollTop()<5 &&
                !this.client.chatManager.fullLoaded[this.client.chatManager.current]){
                    this._setLoadingState();
                    this.client.chatManager.loadMessages();
                }
            },

            _sendMsg: function(text) {
                if (text === '' || typeof text !== 'string') {
                    return;
                }

                if (text.length > this.MAX_MSG_LENGTH) {
                    alert(this.MAX_LENGTH_MSG);
                    return;
                }
                this.client.chatManager.sendMessage(text, null, $('#chatIsAdmin')[0].checked);
                this.$inputMsg.empty();
                this.$inputMsg.focus();
            },

            blurInputMsg: function(e) {
                var target = $(e.currentTarget);

                if (target.text() === '') {
                    target.empty().append(this.$placeHolderSpan); // empty на всякий случай
                }
            },

            clickInputMsg: function(e) {
                var target = $(e.currentTarget);

                if (target.has(this.$placeHolderSpan).length) {
                    target.empty();
                }
            },

            clickTab: function(e) {
                var $target = $(e.target),
                    tabName = $target.attr('data-type');

                if (tabName === this.currentActiveTabName) {
                    return;
                }

                this.currentActiveTabName = tabName;
                this._setActiveTab(this.currentActiveTabName);
                this.client.chatManager.loadCachedMessages(this.tabs[tabName].target);
            },

            initialize: function(_client) {
                this.client = _client;
                this.images = _client.opts.images;
                this.$el.html(this.tplMain());

                this.MAX_MSG_LENGTH = 128;
                this.SCROLL_VAL = 40;
                this.MAX_LENGTH_MSG = 'Сообщение слишком длинное (максимальная длина - 128 символов). Сократите его попробуйте снова';

                this.CLASS_DISABLED = 'disabled';
                this.CLASS_CHATADMIN = 'chatAdmin';
                this.CLASS_DELETE_CHAT_MESSAGE = 'delete';
                this.CLASS_NEW_MSG = 'newMsg';
                this.CLASS_ADMIN_MSG = 'isAdmin';
                this.ACTIVE_TAB_CLASS = 'activeTab';
                this.CLASS_MENU_ELEMENT = 'menuElement';

                this.$menu = this.$el.find('.' + this.CLASS_MENU_ELEMENT); // диалоговое меню при ЛКМ на имени игрока
                if (!this.client.isAdmin) {
                    this.$menu.find('li[data-action="ban"]').remove();
                }
                window.document.body.addEventListener('click', this.hideMenuElement.bind(this));

                this.$rules = $(this.tplRules({close: this.images.close}));
                window.document.body.appendChild(this.$rules[0]);
                this.$rules.find('img.closeIcon').on('click', function() {
                    this.$rules.hide();
                }.bind(this));

                this.$placeHolderSpan = $('<span class="placeHolderSpan">Введите ваше сообщение..</span>');

                this.$spinnerWrap = $('<li class="spinnerWrap"><div class="spinner" style="background: url(' + this.images.spin + ');"></div></li>');
                this.$messagesWrap = this.$el.find('.messagesWrap');
                this.$msgsList = this.$messagesWrap.find('ul');
                this.$inputMsg = this.$el.find('.inputMsg');
                this.$SELECTED_OPTION = this.$el.find('select option:selected');

                this.currentActiveTabName = 'public';
                this.currentActiveTabTitle = _client.game;
                this.tabs = {
                    'public': { target: _client.game, title: 'Общий чат' },
                    'private': null
                };

                this._setActiveTab(this.currentActiveTabName);
                //append element
                if (_client.opts.blocks.chatId)
                    $('#'+_client.opts.blocks.chatId).append(this.el);
                else
                    $('body').append(this.el);

                this.$inputMsg.empty().append(this.$placeHolderSpan);
                this._setLoadingState();

                if (this.client.isAdmin) this.$el.find('.' + this.CLASS_CHATADMIN).removeClass(this.CLASS_CHATADMIN);

                this.listenTo(this.client.chatManager, 'message', this._addOneMsg.bind(this));
                this.listenTo(this.client.chatManager, 'load', this._preaddMsgs.bind(this));
                this.listenTo(this.client.chatManager, 'open_dialog', this._openDialog.bind(this));
                this.listenTo(this.client.chatManager, 'close_dialog', this._closeDialog.bind(this));
                this.$messagesWrap.scroll(this.scrollEvent.bind(this));
            },

            setPublicTab: function(tabName){
                this.tabs.public.target = tabName;
                this.currentActiveTabName = 'public';
                this._setActiveTab('public');
            },

            _setActiveTab: function(tabName) {
                var $tab = this.$el.find('.tabs div[data-type="' + tabName + '"]');
                this.$el.find('.tabs div').removeClass(this.ACTIVE_TAB_CLASS);
                $tab.addClass(this.ACTIVE_TAB_CLASS);
                $tab.html(this.tabs[tabName].title);
                $tab.show();

                this.$msgsList.html('');
                this._setLoadingState();
                this.currentActiveTabTitle = this.tabs[tabName].target;

            },

            render: function() {
                return this;
            },

            _openDialog: function(dialog){
                if (dialog.userId) {
                    this.tabs['private'] = {target: dialog.userId, title: dialog.userName};
                }
                this.currentActiveTabName = 'private';
                this._setActiveTab('private');
            },

            _closeDialog: function(target){
                this.currentActiveTabName = 'public';
                this._setActiveTab('public');
                this.$el.find('.tabs div[data-type="' + 'private' + '"]').hide();
            },

            _deleteMsg: function(e) {
                var $msg, msgId;
                if (!isNaN(+e) && typeof +e === 'number') {
                    msgId = e;
                } else { //клик не по кнопке удалить
                    if (!$(e.target).hasClass(this.CLASS_DELETE_CHAT_MESSAGE)) {
                        return;
                    }
                    $msg = $(e.currentTarget);
                    msgId = $msg.attr('data-msgId')
                }
                if (msgId) {
                    this.client.chatManager.deleteMessage(parseFloat(msgId));
                }
                // если был передан id сообщения
                if (!$msg) {
                    $msg = this.$el.find('li[data-msgId="' + msgId + '"]').remove();
                }

                if (!$msg) {
                    console.warn('cannot find msg with  id', msgId, e);
                    return;
                }

                $msg.remove();
            },

            _addOneMsg: function(msg) {
                //console.log('chat message', msg);
                if (msg.target != this.currentActiveTabTitle) return;
                var $msg = this.tplMsg({msg:msg, imgDel:this.images.del});
                var fScroll = this.$messagesWrap[0].scrollHeight - this.$messagesWrap.height() - this.$messagesWrap.scrollTop() < this.SCROLL_VAL;

                if (!this.client.chatManager.last[msg.target] || this.client.chatManager.last[msg.target].d != msg.d) this.$msgsList.append(this.tplDay(msg));

                this.$msgsList.append($msg);

                $msg = this.$el.find('li[data-msgId="' + msg.time + '"]');
                if (msg.admin) $msg.addClass(this.CLASS_ADMIN_MSG);

                $msg.addClass(this.CLASS_NEW_MSG);
                setTimeout(function(){
                    this.$el.find('li[data-msgId="' + msg.time + '"]').removeClass(this.CLASS_NEW_MSG);
                }.bind(this), 2500);

                //scroll down
                if (fScroll) this.$messagesWrap.scrollTop(this.$messagesWrap[0].scrollHeight)
            },

            _preaddMsgs: function(msg) {
                //console.log('pre chat message', msg);
                if (msg && msg.target != this.currentActiveTabTitle) return;
                this._removeLoadingState();
                if (!msg) return;
                var oldScrollTop =  this.$messagesWrap.scrollTop();
                var oldScrollHeight = this.$messagesWrap[0].scrollHeight;
                var oldDay = this.$el.find('li[data-day-msgId="' + this.client.chatManager.first[msg.target].time + '"]');
                if (oldDay) oldDay.remove();
                // add day previous msg
                if (this.client.chatManager.first[msg.target].d != msg.d) this.$msgsList.prepend(this.tplDay(this.client.chatManager.first[msg.target]));
                var $msg = this.tplMsg({msg: msg, imgDel:this.images.del});
                this.$msgsList.prepend($msg);
                // add day this, now firs message
                this.$msgsList.prepend(this.tplDay(msg));
                $msg = this.$el.find('li[data-msgId="' + msg.time + '"]');
                if (msg.admin) $msg.addClass(this.CLASS_ADMIN_MSG);
                this.$messagesWrap.scrollTop(oldScrollTop + this.$messagesWrap[0].scrollHeight - oldScrollHeight);
            },

            _setLoadingState: function() {
                this.$msgsList.prepend(this.$spinnerWrap);
                this.$messagesWrap.addClass(this.CLASS_DISABLED);
            },

            _removeLoadingState: function(){
                this.$spinnerWrap.remove();
                this.$messagesWrap.removeClass(this.CLASS_DISABLED);
            }
        });
        return ChatView;
    });

define('text!tpls/v6-settingsMain.ejs',[],function () { return '\r\n    <img class="closeIcon" src="<%= close %>">\r\n    <div class="settingsContainer">\r\n    <%= settings %>\r\n    </div>\r\n    <div >\r\n        <div class="confirmBtn">OK</div>\r\n    </div>\r\n';});


define('text!tpls/v6-settingsDefault.ejs',[],function () { return '<p>Настройки игры</p>\r\n<div>\r\n    <div class="option">\r\n        <label><input type="checkbox" name="sounds">\r\n            Включить звук</label>\r\n    </div>\r\n    <div class="option">\r\n        <label><input type="checkbox" name="disableInvite">\r\n            Запретить приглашать меня в игру</label>\r\n    </div>\r\n</div>\r\n';});

define('views/settings',['underscore', 'backbone', 'text!tpls/v6-settingsMain.ejs', 'text!tpls/v6-settingsDefault.ejs'],
    function(_, Backbone, tplMain, tplDefault) {
        

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
                this.changedProperties = [];
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

define('modules/views_manager',['views/user_list', 'views/dialogs', 'views/chat', '../views/settings'], function(userListView, dialogsView, v6ChatView, v6SettingsView) {
    var ViewsManager = function(client){
        this.client = client;
        this.userListView = null;
        this.dialogsView = dialogsView;
        this.chat = null;
    };

    ViewsManager.prototype.init = function() {
        this.userListView = new userListView(this.client);
        this.dialogsView.init(this.client);
        this.v6ChatView = new v6ChatView(this.client);
        this.settingsView = new v6SettingsView(this.client)
    };

    ViewsManager.prototype.closeAll = function(){
        this.client.ratingManager.close();
        this.client.historyManager.close();
        this.settingsView.close();
    };

    ViewsManager.prototype.showSettings = function () {
        this.settingsView.show();
    };

    return ViewsManager;
});
/**
 * Obscene words detector for russian language
 *
 * @name antimat
 * @version 0.0.1
 * @license MIT License - http://www.opensource.org/licenses/mit-license.php
 * @see https://github.com/itlessons/js-antimat
 *
 * Copyright (c) 2014, www.itlessons.info
 */
(function () {

    var t = {};

    window.containsMat = function (text) {
        return t.containsMat(text);
    };

    window.antimat = t;

    t.badPatterns = [
        "^(о|а)н(о|а)нист.*",
        "^лошар.*",
        "^к(а|о)злина$",
        "^к(о|а)зел$",
        "^сволоч(ь|ъ|и|уга|ам|ами).*",
        "^лох[уеыаоэяию].*",
        ".*урод(ы|у|ам|ина|ины).*",
        ".*бля(т|д).*", ".*гандо.*",
        "^м(а|о)нд(а|о).*",
        ".*сперма.*",
        ".*[уеыаоэяию]еб$",
        "^сучк(а|у|и|е|ой|ай).*",
        "^придур(ок|ки).*",
        "^д(е|и)би(л|лы).*",
        "^сос(ать|и|ешь|у)$",
        "^залуп.*",
        "^муд(е|ил|о|а|я|еб).*",
        ".*шалав(а|ы|ам|е|ами).*",
        ".*пр(а|о)ст(и|е)т(у|е)тк(а|и|ам|е|ами).*",
        ".*шлюх(а|и|ам|е|ами).*",
        ".*ху(й|и|я|е|л(и|е)).*",
        ".*п(и|е|ы)зд.*",
        "^бл(я|т|д).*",
        "(с|сц)ук(а|о|и|у).*",
        "^еб.*",
        ".*(д(о|а)лб(о|а)|разъ|разь|за|вы|по)ебы*.*",
        ".*пид(а|о|е)р.*",
        ".*хер.*",
        // appended
        "идиот", 
        "коз(е|ё)л",
        "п(и|е)дрила",
        "лошара",
        "уе(бок|бан)",
        "сучка",
        "отсоси",
        "педик",
        "лесбиянк.*",
        "козлы",
        "говно",
        "жопа",
        "гнидовский",
        "обоссал.*"
    ];

    t.goodPatterns = [
        ".*психу.*",
        ".*плох.*",
        ".*к(о|а)манд.*",
        ".*истр(е|и)блять.*",
        ".*л(о|а)х(о|а)трон.*",
        ".*(о|а)ск(о|а)рблять.*",
        "хул(е|и)ган",
        ".*м(а|о)нд(а|о)рин.*",
        ".*р(а|о)ссл(а|о)блять.*",
        ".*п(о|а)тр(е|и)блять.*",
        ".*@.*\\.(ру|сом|нет)$"
    ];

    t.goodWords = [
        "дезмонда",
        "застрахуйте",
        "одномандатный",
        "подстрахуй",
        "психуй"
    ];

    t.letters = {
        "a": "а",
        "b": "в",
        "c": "с",
        "e": "е",
        "f": "ф",
        "g": "д",
        "h": "н",
        "i": "и",
        "k": "к",
        "l": "л",
        "m": "м",
        "n": "н",
        "o": "о",
        "p": "р",
        "r": "р",
        "s": "с",
        "t": "т",
        "u": "у",
        "v": "в",
        "x": "х",
        "y": "у",
        "w": "ш",
        "z": "з",
        "ё": "е",
        "6": "б",
        "9": "д"
    };

    t.containsMat = function (text) {

        text = t.cleanBadSymbols(text.toLowerCase());

        var words = text.split(" ");

        for (var i = 0; i < words.length; i++) {

            var word = t.convertEngToRus(words[i]);

            if (t.isInGoodWords(word) && t.isInGoodPatterns(word))
                continue;

            if (t.isInBadPatterns(word))
                return true;
        }

        if (t.containsMatInSpaceWords(words))
            return true;

        return false;
    };

    t.convertEngToRus = function (word) {
        for (var j = 0; j < word.length; j++) {
            for (var key in t.letters) {
                if (word.charAt(j) == key)
                    word = word.substring(0, j) + t.letters[key] + word.substring(j + 1, word.length)
            }
        }

        return word;
    };

    t.cleanBadSymbols = function (text) {
        return text.replace(/[^a-zA-Zа-яА-Яё0-9\s]/g, "");
    };

    t.isInGoodWords = function (word) {

        for (var i = 0; i < t.goodWords.length; i++) {
            if (word == t.goodWords[i])
                return true;
        }

        return false;
    };

    t.isInGoodPatterns = function (word) {

        for (var i = 0; i < t.goodPatterns.length; i++) {
            var pattern = new RegExp(t.goodPatterns[i]);
            if (pattern.test(word))
                return true;
        }

        return false;
    };

    t.isInBadPatterns = function (word) {

        for (var i = 0; i < t.badPatterns.length; i++) {
            var pattern = new RegExp(t.badPatterns[i]);
            if (pattern.test(word))
                return true;
        }

        return false;
    };

    t.containsMatInSpaceWords = function (words) {
        var spaceWords = t.findSpaceWords(words);

        for (var i = 0; i < spaceWords.length; i++) {

            var word = t.convertEngToRus(spaceWords[i]);

            if (t.isInBadPatterns(word))
                return true;
        }

        return false;
    };

    t.findSpaceWords = function (words) {

        var out = [];
        var spaceWord = "";

        for(var i=0; i < words.length; i++ ){
            var word = words[i];

            if(word.length <= 3){
                spaceWord += word;
                continue;
            }

            if(spaceWord.length >= 3){
                out.push(spaceWord);
                spaceWord = "";
            }
        }

        return out;
    };

    t.addBadPattern = function (pattern) {
        t.badPatterns.push(pattern);
    };

    t.addGoodPattern = function (pattern) {
        t.goodPatterns.push(pattern);
    };

    t.addGoodWord = function (pattern) {
        t.goodWords.push(pattern);
    };

})();
define("antimat", function(){});

define('modules/chat_manager',['EE', 'antimat'], function(EE) {
    
    var ChatManager = function (client) {
        this.client = client;
        this.first = {};
        this.last = {};
        this.fullLoaded = {};
        this.messages = {};
        this.current = client.game;
        this.MSG_COUNT = 10;

        client.on('login', function(){
            this.current = client.game;
            client.viewsManager.v6ChatView.setPublicTab(client.game);
            this.loadMessages();
        }.bind(this));

        client.gameManager.on('game_start', function(room){
            for (var i = 0; i < room.players.length; i++){
                if (!room.players[i].isPlayer) {
                    this.openDialog(room.players[i].userId, room.players[i].userName);
                }
            }
        }.bind(this));

        client.gameManager.on('game_leave', function(room){
            for (var i = 0; i < room.players.length; i++){
                if (!room.players[i].isPlayer) {
                    this.closeDialog(room.players[i].userId);
                }
            }
        }.bind(this));
    };

    ChatManager.prototype = new EE();


    ChatManager.initMessage = function(message, player, mode){
        if (message.userData[mode]) message.rank = message.userData[mode].rank;
        if (!message.rank || message.rank < 1) message.rank = '—';
        if (message.target == player.userId) // is private message, set target sender
            message.target = message.userId;

        if (message.admin) {
            message.rank = '';
            message.userId = 0;
            message.userName = 'Админ'
        }

        message.date = new Date(message.time);
        var h = message.date.getHours();
        var m = message.date.getMinutes();
        if (h < 10) h = '0' + h;
        if (m < 10) m = '0' + m;
        message.t =  h + ':' + m;
        message.d = message.date.getDate() + ' ' + ChatManager.months[message.date.getMonth()] + ' ' + message.date.getFullYear();
        return message;
    };

    ChatManager.months = ['Января', 'Февраля', 'Марта', 'Апреля', 'Мая', 'Июня', 'Июля', 'Сентября', 'Октября', 'Ноября', 'Декабря'];


    ChatManager.prototype.onMessage = function (message) {
        var data = message.data, player = this.client.getPlayer(), i, cache;
        console.log('chat_manager;', 'message', message);
        switch (message.type) {
            case 'message':
                message = ChatManager.initMessage(data, player, this.client.currentMode);
                if (!this.first[message.target]) this.first[message.target] = message;

                if (!this.messages[message.target]) this.messages[message.target] = [];
                cache = this.messages[message.target];
                cache.push(message);
                if (cache.length>100) cache.shift();

                this.emit('message', message);
                this.last[message.target] = message;

                if (message.target != this.client.game && message.target != this.current) this.openDialog(message.userId, message.userName);
                break;
            case 'load':
                if (!data.length || data.length<1) {
                    this.fullLoaded[this.current] = true;
                    this.emit('load', null);
                    return;
                }
                message = ChatManager.initMessage(data[0], player, this.client.currentMode);
                if (!this.messages[message.target]) this.messages[message.target] = [];
                cache = this.messages[message.target];
                for (i = 0; i < data.length; i++){
                   this.onMessageLoad(ChatManager.initMessage(data[i], player, this.client.currentMode), cache);
                }
                break;
            case 'ban':
                this.ban = message.data;
                this.emit('show_ban', message.data);
                break;
        }
    };


    ChatManager.prototype.sendMessage = function (text, target, admin){
        if (this.ban){
            this.emit('show_ban', this.ban);
            return;
        }
        if (window.containsMat(text)){
            console.warn('chat_manager; censored text', text);
            return;
        }
        var message = {
            text: text
        };
        if (admin) message.admin = true;
        if (!target) message.target = this.current;
        this.client.send('chat_manager', 'message', 'server', message);
    };


    ChatManager.prototype.loadMessages = function (count, time, target) {
        if (this.fullLoaded[this.current]){
            console.log('chat_manager;', 'all messages loaded!', count, time, this.first);
            this.emit('load', null);
            return;
        }
        count = count || this.MSG_COUNT;
        if (!target) target = this.current;
        time = time || (this.first[target]?this.first[target].time:null);
        console.log('chat_manager;', 'loading messages', count, time, this.first);
        this.client.send('chat_manager', 'load', 'server', {count:count, time:time, target:target});
    };


    ChatManager.prototype.onMessageLoad = function(message, cache){
        if (cache && cache.length<100) cache.unshift(message);
        if (!this.first[message.target]) this.first[message.target] = message;
        if (!this.last[message.target]) this.last[message.target] = message;
        this.emit('load', message);
        this.first[message.target] = message;
    };


    ChatManager.prototype.openDialog = function(userId, userName){
        this.current = userId;
        this.emit('open_dialog', {userId: userId, userName:userName});
        this.loadCachedMessages(userId);
    };


    ChatManager.prototype.closeDialog = function (target){
        this.emit('close_dialog', target || this.current);
        this.loadCachedMessages(this.client.game);
    };


    ChatManager.prototype.loadCachedMessages = function (target){
        this.current = target;
        this.first[target] = this.last[target] = null;
        if (this.messages[target] && this.messages[target].length>0){ // load cached messages;
            for (var i = this.messages[target].length - 1; i >= 0; i-- ){
                this.onMessageLoad(this.messages[target][i]);
            }
        }
        if (this.messages[target] && this.messages[target].length > 0
            && this.messages[target].length < this.MSG_COUNT) {
            this.loadMessages(this.MSG_COUNT, this.messages[target][0], target);
        }  else this.loadMessages(this.MSG_COUNT, null, target);
    };


    ChatManager.prototype.banUser = function(userId, days, reason) {
        console.log('chat_manager;', 'banUser', userId, days, reason);
        this.client.send('chat_manager', 'ban', 'server', {userId:userId, days:days, reason:reason});
    };

    ChatManager.prototype.deleteMessage = function(time) {
        console.log('chat_manager;', 'deleteMessage', time);
        this.client.send('chat_manager', 'delete', 'server', {time:time});
    };

    return ChatManager;
});

define('text!tpls/v6-historyMain.ejs',[],function () { return '<div id="v6-history">\r\n    <div class="historyHeader"><img class="closeIcon" src="<%= close %>" title="Закрыть окно истории"></div>\r\n    <div class="historyWrapper">\r\n        <table class="historyTable">\r\n            <thead>\r\n                <tr></tr>\r\n            </thead>\r\n            <tbody>\r\n            </tbody>\r\n        </table>\r\n        <div class="noHistory">Сохранения отсутствуют</div>\r\n        <div class="loading"><img src="<%= spin %>"></div>\r\n    </div>\r\n</div>';});


define('text!tpls/v6-historyHeaderTD.ejs',[],function () { return '<td class="sessionHeader historyDate" rowspan="<%= rows %>"> <%= date %> </td>\r\n<td class="sessionHeader historyName" rowspan="<%= rows %>">\r\n    <span class="userName" data-userid="<%= userId %>"><%= userName %></span>\r\n    <span class="userRank">(<%= rank %>)</span>\r\n    <span class="userScore"><%= score %></span>\r\n    <div class="eloDiff <%= (eloDiff>-1?\'diffPositive\':\'diffNegative\')%>"><%= eloDiff ===\'\'?\'\':(eloDiff>-1?\'+\'+eloDiff:eloDiff)%></div>\r\n</td>';});


define('text!tpls/v6-historyTH.ejs',[],function () { return '<th colspan="<%= colspan %>" title="<%= title %>"><%= value %></th>';});


define('text!tpls/v6-historyTR.ejs',[],function () { return '<tr title="<%= title %>" class="<%= trclass %>" data-id="<%= id %>" ><%= value %></tr>';});


define('text!tpls/v6-ratingTab.ejs',[],function () { return '<span class="unactiveLink"  data-idtab="<%= id %>"><%= title %></span>&nbsp;&nbsp;';});

define('views/history',['underscore', 'backbone', 'text!tpls/v6-historyMain.ejs', 'text!tpls/v6-historyHeaderTD.ejs', 'text!tpls/v6-historyTH.ejs', 'text!tpls/v6-historyTR.ejs', 'text!tpls/v6-ratingTab.ejs'],
    function(_, Backbone, tplMain, tplTD, tplTH, tplTR, tplTab) {
        

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
                'click .historyHeader span': 'tabClicked'
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

            render: function(mode, history, hideClose) {
                this.$tbody.children().remove();
                this.$el.show();
                this.setActiveTab(mode);
                if (hideClose === true) this.$el.find('.closeIcon').hide();
                if (hideClose === false) this.$el.find('.closeIcon').show();

                if (!history) {
                    this.isClosed = false;
                    this.$el.find('.loading').show();
                    this.$noHistory.hide();
                }
                else {
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
define('modules/history_manager',['EE', 'views/history'], function(EE, HistoryView) {
    

    var HistoryManager = function (client) {
        this.client = client;
        this.conf = {
            tabs:[],
            subTabs:[],
            columns:[
                {  id:'date',       source:'date',      title:'Дата' },
                {  id:'opponent',   source:'opponent',  title:'Противник' },
                {  id:'time',       source:'time',      title:'Время'     },
                {  id:'number',     source:'number',    title:'#' },
                {  id:'elo',        source:'elo',       title:'Рейтинг', dynamic:true, startValue:1600 }
            ]
        };

        if (typeof client.opts.initHistory== "function") this.conf =  client.opts.initHistory(this.conf);
        this.conf.images = client.opts.images;

        this.$container = (client.opts.blocks.historyId?$('#'+client.opts.blocks.historyId):$('body'));
        this.isCancel = false;
        this.userId = false;
        this.currentMode = false;
    };

    HistoryManager.prototype = new EE();


    HistoryManager.prototype.init = function(conf){
        if (this.client.modes.length > 1)
            for (var i = 0 ; i < this.client.modes.length; i++)
                this.conf.tabs.push({id:this.client.modes[i], title: this.client.getModeAlias(this.client.modes[i])});
        this.historyView = new HistoryView(this.conf, this);
    };


    HistoryManager.prototype.onMessage = function (message) {
        var data = message.data;
        console.log('history_manager;', 'message', message);
        switch (message.type) {
            case 'history': this.onHistoryLoad(data.mode, data.history, data.userId); break;
            case 'game': this.onGameLoad(data.mode, data.game); break;
        }
    };


    HistoryManager.prototype.onHistoryLoad = function (mode, history, userId){
        console.log('history_manager;', 'history load', userId, history);
        setTimeout(function(){
            if (!this.historyView.isClosed){
                var histTable = [];
                this.userId = userId;
                this.currentMode = mode;
                for (var i = history.length-1; i > -1; i--){
                    this.formatHistoryRow(history[i], histTable, mode, history.length - i, userId);
                }
                this.$container.append(this.historyView.render(mode, histTable).$el);
            }
        }.bind(this),200);
    };


    HistoryManager.prototype.onGameLoad = function (mode, game){
        console.log('history_manager;', 'game load', game);
        //TODO initGame, gameManager
        game.history = '['+game.history+']';
        game.history = game.history.replace(new RegExp('@', 'g'),',');
        game.history = JSON.parse(game.history);
        game.initData = JSON.parse(game.initData);
        game.userData = JSON.parse(game.userData);
        var players = [];
        for (var i = 0; i < game.players.length; i++){
            players.push(this.client.userList.createUser(game.userData[game.players[i]]));
        }
        if (players.length != players.length) throw new Error('UserData and players are different!');
        game.players = players;
        console.log('history_manager;', 'game parsed', game);
        setTimeout(function(){
            if (!this.isCancel) this.emit('game_load', game);
        }.bind(this),200);
    };


    HistoryManager.prototype.formatHistoryRow = function(hrow, history, mode, number, userId){
        var rows, row = {win:0, lose:0, id:hrow['_id'], number:number}, prev, userData = JSON.parse(hrow.userData), opponentId;
        //previous game
        if (history.length == 0) {
            rows = [];
            prev = null
        } else {
            rows = history[0];
            prev = rows[0];
        }
        opponentId =  userId == hrow.players[0]? hrow.players[1] : hrow.players[0];
        for (var i = 0; i < this.conf.columns.length; i++){
            var col = this.conf.columns[i];
            if (['date', 'opponent', 'time', 'number', 'elo'].indexOf(col.id) == -1){
                row[col.source] = userData[userId][mode][col.source];
            }
        }
        row.opponent = userData[opponentId];
        row.date = formatDate(hrow.timeStart);
        row.time = formatTime(hrow.timeStart);
        // compute game score
        if (!hrow.winner) row.result = 'draw';
        else {
            if (hrow.winner == userId) {
                row.result = 'win';
                row.win++;
            } else {
                row.result = 'lose';
                row.lose++;
            }
        }
        if (prev && prev.date == row.date && prev.opponent.userId == row.opponent.userId){
            row.win += prev.win;
            row.lose += prev.lose;
        }
        row.gameScore = row.win + ':' + row.lose;
        //compute elo
        row.elo = {
            value:userData[userId][mode]['ratingElo']
        };
        //TODO: dynamic columns
        row.elo.dynamic = prev ? row.elo.value - prev.elo.value : '';

        if (!prev || prev.date != row.date || prev.opponent.userId != row.opponent.userId){
            row.elo.diff = row.elo.dynamic||0;
            rows = [];
            rows.unshift(row);
            history.unshift([]);
            history[0] = rows
        } else {
            row.elo.diff = prev.elo.diff + row.elo.dynamic;
            rows.unshift(row);
        }
    };


    HistoryManager.prototype.getHistory = function(mode, isUpdate, hideClose){
        if (!isUpdate) this.$container = (this.client.opts.blocks.historyId?$('#'+this.client.opts.blocks.historyId):$('body'));
        this.$container.append(this.historyView.render(mode||this.client.currentMode, false, hideClose).$el);
        this.client.send('history_manager', 'history', 'server', {mode:mode||this.client.currentMode, userId:(isUpdate?this.userId:false)});
    };

    HistoryManager.prototype.getProfileHistory = function(mode, userId, blockId){
        if (blockId) this.$container = $('#'+blockId);
        if (!this.$container) throw new Error('wrong history container id! ' + blockId);
        this.$container.append(this.historyView.render(mode, false, true).$el);
        this.userId = userId;
        this.client.send('history_manager', 'history', 'server', {mode:mode||this.client.currentMode, userId:userId});
    };


    HistoryManager.prototype.getGame = function (id, userId, mode) {
        userId = userId || this.userId || this.client.getPlayer().userId;
        mode = mode || this.currentMode || this.client.currentMode;
        this.isCancel = false;
        this.client.send('history_manager', 'game', 'server', {mode:mode, id:id, userId: userId});
    };


    HistoryManager.prototype.close = function(){
      this.historyView.close();
    };

    function formatDate(time) {
        var months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'сен', 'окт', 'ноя', 'дек'];
        var date = new Date(time);
        var day = date.getDate();
        var month = months[date.getMonth()];
        var year = date.getFullYear();
        if (day < 10) day = '0' + day;
        return day + " " + month + " "  + year;
    }

    function formatTime(time) {
        var date =  new Date(time);
        var h = date.getHours();
        var m = date.getMinutes();
        if (h < 10) h = '0' + h;
        if (m < 10) m = '0' + m;
        return  h + ':' + m;
    }

    HistoryManager.prototype.testHistory = [{"timeStart":1424080866344,"timeEnd":1424080868891,"players":["22050161915831","95120799727737"],"mode":"default","winner":"22050161915831","action":"game_over","userData":"{\"22050161915831\":{\"userId\":\"22050161915831\",\"userName\":\"us_22050161915831\",\"dateCreate\":1424080636958,\"default\":{\"win\":4,\"lose\":2,\"draw\":0,\"games\":6,\"rank\":1,\"ratingElo\":1627}},\"95120799727737\":{\"userId\":\"95120799727737\",\"userName\":\"us_95120799727737\",\"dateCreate\":1424080722018,\"default\":{\"win\":1,\"lose\":2,\"draw\":0,\"games\":3,\"rank\":5,\"ratingElo\":1587}}}"},{"timeStart":1424080860196,"timeEnd":1424080862868,"players":["22050161915831","95120799727737"],"mode":"default","winner":"22050161915831","action":"game_over","userData":"{\"22050161915831\":{\"userId\":\"22050161915831\",\"userName\":\"us_22050161915831\",\"dateCreate\":1424080636958,\"default\":{\"win\":3,\"lose\":2,\"draw\":0,\"games\":5,\"rank\":3,\"ratingElo\":1613}},\"95120799727737\":{\"userId\":\"95120799727737\",\"userName\":\"us_95120799727737\",\"dateCreate\":1424080722018,\"default\":{\"win\":1,\"lose\":1,\"draw\":0,\"games\":2,\"rank\":5,\"ratingElo\":1600}}}"},{"timeStart":1424080754813,"timeEnd":1424080762501,"players":["95120799727737","22050161915831"],"mode":"default","winner":"95120799727737","action":"game_over","userData":"{\"95120799727737\":{\"userId\":\"95120799727737\",\"userName\":\"us_95120799727737\",\"dateCreate\":1424080722018,\"default\":{\"win\":1,\"lose\":0,\"draw\":0,\"games\":1,\"rank\":3,\"ratingElo\":1615}},\"22050161915831\":{\"userId\":\"22050161915831\",\"userName\":\"us_22050161915831\",\"dateCreate\":1424080636958,\"default\":{\"win\":2,\"lose\":2,\"draw\":0,\"games\":4,\"rank\":5,\"ratingElo\":1598}}}"},{"timeStart":1424080713717,"timeEnd":1424080715662,"players":["98637392232194","22050161915831"],"mode":"default","winner":"98637392232194","action":"game_over","userData":"{\"98637392232194\":{\"userId\":\"98637392232194\",\"userName\":\"us_98637392232194\",\"dateCreate\":1424080704161,\"default\":{\"win\":1,\"lose\":0,\"draw\":0,\"games\":1,\"rank\":1,\"ratingElo\":1616}},\"22050161915831\":{\"userId\":\"22050161915831\",\"userName\":\"us_22050161915831\",\"dateCreate\":1424080636958,\"default\":{\"win\":2,\"lose\":1,\"draw\":0,\"games\":3,\"rank\":3,\"ratingElo\":1612}}}"},{"timeStart":1424080696911,"timeEnd":1424080698325,"players":["22050161915831","21508051152341"],"mode":"default","winner":"22050161915831","action":"game_over","userData":"{\"22050161915831\":{\"userId\":\"22050161915831\",\"userName\":\"us_22050161915831\",\"dateCreate\":1424080636958,\"default\":{\"win\":2,\"lose\":0,\"draw\":0,\"games\":2,\"rank\":1,\"ratingElo\":1627}},\"21508051152341\":{\"userId\":\"21508051152341\",\"userName\":\"us_21508051152341\",\"dateCreate\":1423834457435,\"default\":{\"win\":0,\"lose\":3,\"draw\":0,\"games\":3,\"rank\":4,\"ratingElo\":1561}}}"},{"timeStart":1424080690059,"timeEnd":1424080692709,"players":["22050161915831","21508051152341"],"mode":"default","winner":"22050161915831","action":"game_over","userData":"{\"22050161915831\":{\"userId\":\"22050161915831\",\"userName\":\"us_22050161915831\",\"dateCreate\":1424080636958,\"default\":{\"win\":1,\"lose\":0,\"draw\":0,\"games\":1,\"rank\":2,\"ratingElo\":1614}},\"21508051152341\":{\"userId\":\"21508051152341\",\"userName\":\"us_21508051152341\",\"dateCreate\":1423834457435,\"default\":{\"win\":0,\"lose\":2,\"draw\":0,\"games\":2,\"rank\":4,\"ratingElo\":1573}}}"}]
    return HistoryManager;
});

define('text!tpls/v6-ratingMain.ejs',[],function () { return '<div id="v6-rating">\r\n    <img class="closeIcon" src="<%= close %>" title="Закрыть окно рейтинга">\r\n    <div>\r\n        <!-- rating filter panel -->\r\n        <div class="filterPanel">\r\n            <div style="margin-left: 8px;">\r\n\r\n            </div>\r\n        </div>\r\n        <div class="loading"><img src="<%= spin %>"></div>\r\n        <!-- rating table -->\r\n        <table class="ratingTable" cellspacing="0">\r\n            <thead>\r\n                <tr class="headTitles">\r\n\r\n                </tr>\r\n                <tr class="headIcons">\r\n\r\n                </tr>\r\n            </thead>\r\n            <tbody class="ratingTBody">\r\n\r\n            </tbody>\r\n        </table>\r\n\r\n        <!-- div show more -->\r\n        <div class="chat-button chat-post" id="ratingShowMore">\r\n            <span>Ещё 500 игроков</span>\r\n        </div>\r\n\r\n        <!-- div bottom buttons -->\r\n        <div class="footButtons">\r\n            <div style="float:left"><span class="activeLink" id="jumpTop">[в начало рейтинга]</span></div>\r\n            <div style="float:right"><span class="activeLink" id="closeRatingBtn">[закрыть]</span> </div>\r\n        </div>\r\n    </div>\r\n</div>';});


define('text!tpls/v6-ratingTD.ejs',[],function () { return '<td data-idcol="<%= id %>" class="rating<%= id %>"><div><%= value %><sup class="greenSup"><%= sup %></sup></div></td>';});


define('text!tpls/v6-ratingTH.ejs',[],function () { return '<th data-idcol="<%= id %>" class="ratingTH<%= id %>" title="<%= title %>"><%= value %></th>';});


define('text!tpls/v6-ratingTR.ejs',[],function () { return '<tr class="<%= trclass %>" data-userId="<%= userId %>" data-userName="<%= userName %>"><%= value %></tr>';});


define('text!tpls/v6-ratingSearch.ejs',[],function () { return '<div style="padding-bottom:2px;">\r\n    <div style="float:left;margin-top:4px;">Поиск:</div>\r\n    <input type="text" placeholder="Поиск по имени" id="ratingAutoComplete" value="">\r\n</div>';});


define('text!tpls/v6-ratingPhoto.ejs',[],function () { return '<div style="float:right;margin-top:2px;">\r\n    <a href="<%= photo %>" rel="lightbox" data-lightbox="<%= photo %>"><img src="i/camera.png"></a>\r\n</div>';});


define('text!tpls/v6-ratingUser.ejs',[],function () { return '<span class="userName" data-userid="<%= userId %>"><%= userName %></span>';});

define('views/rating',['underscore', 'backbone', 'text!tpls/v6-ratingMain.ejs', 'text!tpls/v6-ratingTD.ejs', 'text!tpls/v6-ratingTH.ejs',
        'text!tpls/v6-ratingTR.ejs', 'text!tpls/v6-ratingTab.ejs', 'text!tpls/v6-ratingSearch.ejs',
        'text!tpls/v6-ratingPhoto.ejs', 'text!tpls/v6-ratingUser.ejs'],
    function(_, Backbone, tplMain, tplTD, tplTH, tplTR, tplTab, tplSearch, tplPhoto, tplUser) {
        

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
                'click .ratingTable .userName': 'userClicked'
            },

            thClicked: function(e){
                var id = $(e.currentTarget).attr('data-idcol');
                for (var i = 0; i < this.columns.length; i++){
                    if (this.columns[i].id == id && this.columns[i].canOrder){
                        this.setColumnOrder(id);
                        console.log('log; rating col clicked',this.columns[i]);
                        this.manager.getRatings(this.currentSubTab.id, this.currentCollumn.id, this.currentCollumn.order < 0? 'desc':'asc');
                        break;
                    }
                }
            },

            tabClicked: function (e){
                var id = $(e.currentTarget).attr('data-idtab');
                for (var i = 0; i < this.subTabs.length; i++){
                    if (this.subTabs[i].id == id){
                        this.setActiveSubTab(id);
                        this.manager.getRatings(this.currentSubTab.id, this.currentCollumn.id, this.currentCollumn.order < 0? 'desc':'asc');
                        return;
                    }
                }
            },

            userClicked: function (e){
                var userId = $(e.currentTarget).attr('data-userid');
                var userName = $(e.currentTarget).html();
                this.manager.client.onShowProfile(userId, userName);
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
                    if (col.id == 'userName') th.value = this.tplSearch();
                    this.$icons.append(this.tplTH(th));
                }
                this.setColumnOrder('ratingElo');
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
                    if (row[this.columns[i].source] == undefined) row[this.columns[i].source] = this.columns[i].undef;
                    col = {
                        id: this.columns[i].id,
                        value: row[this.columns[i].source],
                        sup: ''
                    };
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

            render: function(ratings, mode, column, order) {
                this.$el.show();
                this.setColumnOrder(column, order);
                if (mode) this.setActiveSubTab(mode);
                if (!ratings) {
                    this.isClosed = false;
                    this.$el.find('.loading').show();
                }
                else {
                    this.$el.find('.loading').hide();
                    this.$head.find('.'+this.HEAD_USER_CLASS).remove();
                    this.$tbody.children().remove();
                    console.log('render ratings', ratings);
                    this.renderRatings(ratings);
                }

                return this;
            }


        });
        return RatingView;
    });
define('modules/rating_manager',['EE', 'views/rating'], function(EE, RatingView) {
    

    var RatingManager = function (client) {
        this.client = client;
        this.conf = {
            tabs:[
                {id: 'all_players', title: 'все игроки'}
            ],
            subTabs:[
            ],
            columns:[
                {  id:'rank',           source:'rank',        title:'Место',                    canOrder:false },
                {  id:'userName',       source:'userName',    title:'Имя',                      canOrder:false },
                {  id:'ratingElo',      source:'ratingElo',   title:'Рейтинг <br> Эло',         canOrder:true },
                {  id:'win',            source:'win',         title:'Выиграл <br> у соперников',canOrder:true },
                {  id:'percent',        source:'percent',     title:' % ',                      canOrder:false },
                {  id:'dateCreate',     source:'dateCreate',  title:'Дата <br> регистрации',    canOrder:true }
            ]
        };

        if (typeof client.opts.initRating == "function") this.conf =  client.opts.initRating(this.conf);
        this.conf.images = client.opts.images;

        this.$container = (client.opts.blocks.ratingId?$('#'+client.opts.blocks.ratingId):$('body'));
    };

    RatingManager.prototype = new EE();


    RatingManager.prototype.init = function(conf){
        for (var i = 0 ; i < this.client.modes.length; i++)
            this.conf.subTabs.push({id:this.client.modes[i], title:this.client.getModeAlias(this.client.modes[i])});

        this.ratingView = new RatingView(this.conf, this);
    };


    RatingManager.prototype.onMessage = function (message) {
        var data = message.data, i;
        console.log('rating_manager;', 'message', message);
        switch (message.type) {
            case 'ratings': this.onRatingsLoad(data.mode, data.ratings, data.column, data.order); break;
        }
    };


    RatingManager.prototype.onRatingsLoad = function (mode, ratings, column, order){
        var rank = false;
        if (this.ratingView.isClosed) return;
        if (ratings.infoUser) {
            ratings.infoUser = this.formatRatingsRow(mode, ratings.infoUser, ratings.infoUser[mode].rank);
        }
        for (var i = 0; i < ratings.allUsers.length; i++) {
            if (column == 'ratingElo' && order == 'desc') rank = i+1; // set rank on order by rating
            ratings.allUsers[i] = this.formatRatingsRow(mode, ratings.allUsers[i], rank);
        }
        setTimeout(function(){
            this.$container.append(this.ratingView.render(ratings, mode, column, order).$el);
        }.bind(this),200);
    };


    RatingManager.prototype.formatRatingsRow = function(mode, info, rank){
        var row = {
            userId: info.userId,
            userName: info.userName,
            photo: undefined
        };
        for (var i in info[mode]){
            row[i] = info[mode][i];
        }
        if (rank !== false) row.rank = rank; // set rank on order
        else row.rank = '';
        if (this.client.getPlayer() && info.userId == this.client.getPlayer().userId) row.user = true;
        if (this.client.userList.getUser(info.userId)) row.active = true;
        row.percent = (row.games>0?Math.floor(row.win/row.games*100):0);
        if (Date.now() - info.dateCreate < 86400000)
            row.dateCreate = this.ratingView.NOVICE;
        else
            row.dateCreate = formatDate(info.dateCreate);
        return row;
    };


    RatingManager.prototype.getRatings = function(mode, column, order){
        this.$container.append(this.ratingView.render(false).$el);
        this.client.send('rating_manager', 'ratings', 'server', {
            mode:mode||this.client.currentMode,
            column : column,
            order : order
        });
    };

    RatingManager.prototype.close = function(){
        this.ratingView.close();
    };

    function formatDate(time) {
        var date = new Date(time);
        var day = date.getDate();
        var month = date.getMonth() + 1;
        var year = ("" + date.getFullYear()).substr(2, 2);
        return ext(day, 2, "0") + "." + ext(month, 2, "0") + "."  + year;
        function ext(str, len, char) {
            //char = typeof (char) == "undefined" ? "&nbsp;" : char;
            str = "" + str;
            while (str.length < len) {
                str = char + str;
            }
            return str;
        }
    }

    RatingManager.prototype.testRatings = {"allUsers":[{"userId":"95514","userName":"us_95514","dateCreate":1423486149906,"mode1":{"win":2,"lose":0,"draw":0,"games":2,"rank":1,"ratingElo":1627},"mode2":{"win":1,"lose":0,"draw":0,"games":1,"rank":1,"ratingElo":1615}},{"userId":"93361","userName":"us_93361","dateCreate":1423486098554,"mode1":{"win":1,"lose":0,"draw":0,"games":1,"rank":2,"ratingElo":1615},"mode2":{"win":0,"lose":0,"draw":0,"games":0,"rank":0,"ratingElo":1600}},{"userId":"99937","userName":"us_99937","dateCreate":1423486099570,"mode1":{"win":0,"lose":3,"draw":0,"games":3,"rank":3,"ratingElo":1561},"mode2":{"win":0,"lose":1,"draw":0,"games":1,"rank":2,"ratingElo":1586}}],"infoUser":{"userId":"99937","userName":"us_99937","dateCreate":1423486099570,"mode1":{"win":0,"lose":3,"draw":0,"games":3,"rank":3,"ratingElo":1561},"mode2":{"win":0,"lose":1,"draw":0,"games":1,"rank":2,"ratingElo":1586}}};
    return RatingManager;
});
define('client',['modules/game_manager', 'modules/invite_manager', 'modules/user_list', 'modules/socket', 'modules/views_manager', 'modules/chat_manager', 'modules/history_manager', 'modules/rating_manager', 'EE'],
function(GameManager, InviteManager, UserList, Socket, ViewsManager, ChatManager, HistoryManager, RatingManager,  EE) {
    
    var Client = function(opts) {
        this.version = "0.7.7";
        opts.resultDialogDelay = opts.resultDialogDelay || 0;
        opts.modes = opts.modes || opts.gameModes || ['default'];
        opts.reload = opts.reload || false;
        opts.turnTime = opts.turnTime || 60;
        opts.blocks = opts.blocks || {};
        opts.images = opts.images || {
            close: 'i/close.png',
            spin:  'i/spin.gif',
            sortAsc:  'i/sort-asc.png',
            sortDesc:  'i/sort-desc.png',
            sortBoth:  'i/sort-both.png',
            del: 'i/delete.png'
        };
        opts.settings = opts.settings || {};

        try{
            this.isAdmin = opts.isAdmin || LogicGame.isSuperUser();
        }catch (e){
            this.isAdmin = false;
            console.error(e);
        }

        var self = this;

        this.opts = opts;
        this.game = opts.game || 'test';
        this.defaultSettings = $.extend(defaultSettings, opts.settings);
        this.modesAlias = {};
        this.gameManager = new GameManager(this);
        this.userList = new UserList(this);
        this.inviteManager = new InviteManager(this);
        this.chatManager = new ChatManager(this);
        this.viewsManager = new ViewsManager(this);
        this.historyManager = new HistoryManager(this);
        this.ratingManager = new RatingManager(this);

        this.currentMode = null;

        this.socket = new Socket(opts);
        this.socket.on("connection", function () {
            console.log('client;', 'socket connected');
        });

        this.socket.on("disconnection", function() {
            console.log('client;', 'socket disconnected');
            self.isLogin = false;
            self.emit('disconnected');
        });

        this.socket.on("failed", function() {
            console.log('client;', 'socket connection failed');
            self.emit('disconnected');
        });

        this.socket.on("message", function(message) {
            console.log('client;', "socket message", message);
            self.onMessage(message);
        });

        this.getUser = this.userList.getUser.bind(this.userList);

        self.unload = false;
        window.onbeforeunload = function(){
            self.unload = true;
        };
    };

    Client.prototype  = new EE();

    Client.prototype.init = function(){
        this.socket.init();
        this.viewsManager.init();
        console.log('client;', 'init version:', this.version);
        return this;
    };


    Client.prototype.onMessage = function(message){
        switch (message.module){
            case 'server': this.onServerMessage(message); break;
            case 'invite_manager': this.inviteManager.onMessage(message); break;
            case 'game_manager': this.gameManager.onMessage(message); break;
            case 'chat_manager': this.chatManager.onMessage(message); break;
            case 'history_manager': this.historyManager.onMessage(message); break;
            case 'rating_manager': this.ratingManager.onMessage(message); break;
        }
    };


    Client.prototype.onServerMessage = function(message){
        var data = message.data;
        switch (message.type){
            case 'login':
                this.onLogin(data.you, data.userlist, data.rooms, data.opts, data.ban, data.settings);
                break;
            case 'user_relogin':
                var user = this.userList.getUser(data.userId);
                console.log('client;', 'user relogin', user);
                if (user) this.emit('user_relogin', user);
                break;
            case 'user_login':
                this.userList.onUserLogin(data);
                break;
            case 'user_leave':
                this.userList.onUserLeave(data);
                break;
            case 'new_game':
                this.userList.onGameStart(data.room, data.players);
                this.gameManager.onMessage(message);
                break;
            case 'end_game':
                this.userList.onGameEnd(data.room, data.players);
                break;
            case 'error':
                this.onError(data);
                break;
        }
    };

    Client.prototype.onLogin = function(user, userlist, rooms, opts, ban, settings){
        console.log('client;', 'login', user, userlist, rooms, opts, ban, settings);
        settings = settings || {};
        this.game = this.opts.game = opts.game;
        this.modes = this.opts.modes = opts.modes;
        this.modesAlias = this.opts.modesAlias = opts.modesAlias || this.modesAlias;
        this.opts.turnTime = opts.turnTime;
        this.chatManager.ban = ban;
        this.currentMode = this.modes[0];
        this.settings = $.extend(this.defaultSettings, settings);
        console.log('client;', 'settings',  this.settings);

        this.userList.onUserLogin(user, true);
        for (var i = 0; i < userlist.length; i++) this.userList.onUserLogin(userlist[i]);
        for (i = 0; i< rooms.length; i++) this.userList.onGameStart(rooms[i].room, rooms[i].players);

        this.isLogin = true;

        this.emit('login', user);

        this.ratingManager.init();
        this.historyManager.init();
    };


    Client.prototype.send = function (module, type, target, data) {
        if (!this.socket.isConnected){
            console.error('Client can not send message, socket is not connected!');
            return;
        }
        if (!this.isLogin){
            console.error('Client can not send message, client is not login!');
            return;
        }
        if (typeof module == "object" && module.module && module.type && module.data) {
            type = module.type;
            data = module.data;
            target = module.target;
            module = module.module;
        }
        if (!module || !type || !data || !target){
            console.warn('client;', "some arguments undefined!", module, type, target, data);
            return;
        }
        if (target != 'server'){
            if (!this.userList.getUser(target)) console.warn('client;', 'send message to offline user!', target);
        }
        this.socket.send({
            module:module,
            type:type,
            target:target,
            data:data
        });
    };

    Client.prototype.setMode = function (mode){
        if (!this.socket.isConnected || !this.isLogin){
            console.error('Client can set mode, socket is not connected!');
            return;
        }
        if (!this.modes|| this.modes.length<1){
            console.error('Client can set mode, no modes!');
            return;
        }
        if (this.modes[mode]) {
            this.currentMode = this.modes[mode];
            this.emit('mode_switch', this.currentMode);
            return
        }
        else {
            for (var i = 0; i < this.modes.length; i++){
                if (this.modes[i] == mode) {
                    this.currentMode = mode;
                    this.emit('mode_switch', this.currentMode);
                    return;
                }
            }
        }
        console.error('wrong mode:', mode, 'client modes:',  this.modes)
    };

    Client.prototype.onError = function (error) {
        console.error('client;', 'server error', error);
        if (error == 'login_error') {
            this.emit('login_error');
            this.socket.ws.close();
        }
    };


    Client.prototype.onShowProfile = function(userId, userName){
        if (!userName) {
            var user = this.userList.getUser(userId);
            if (!user) {
                console.error('client;', 'user', userId, ' is not online!, can not get his name');
                return;
            }
            userName = user.userName;
        }
        this.emit('show_profile', {userId:userId, userName:userName});
    };


    Client.prototype.getPlayer = function(){
        return this.userList.player;
    };


    Client.prototype.getModeAlias = function(mode){
        if (this.modesAlias[mode]) return this.modesAlias[mode];
        else return mode;
    };


    Client.prototype.saveSettings = function(settings){
        settings = settings || this.settings;
        var saveSettings = {};
        for (var prop in this.defaultSettings){
            if (this.defaultSettings.hasOwnProperty(prop))
                saveSettings[prop] = settings[prop];
        }
        console.log('client;', 'save settings:', saveSettings);
        this.send('server', 'settings', 'server', saveSettings);
        this.emit('settings_saved', settings)
    };


    Client.prototype._onSettingsChanged = function(property){
        this.emit('settings_changed', property);
    };

    var defaultSettings = {
        disableInvite: false,
        sounds: true
    };

    return Client;
});
define('v6-game-client',['client'], function(Client) {
    // TODO client is global(make singleton)
    // TODO css images not found)
    

    console.log('main;', new Date(), 'ready');

    return Client;
});
define('main.js',['v6-game-client'], function (Client) {
    return Client;
});

define('require-cnf',[],function() {});
define('jquery', function() {return jQuery});
define('jquery-ui', function() {return jQuery});
define('underscore', function() {return Underscore});
define('backbone', function() {return Backbone});
require(['require-cnf'], function() {
        require(['v6-game-client'], function(Client) {
            console.log('app v6-game-client start');
            window.Client = Client;
        }, undefined, true);
}, undefined, true);
}($, _, Backbone));