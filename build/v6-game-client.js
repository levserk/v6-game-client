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
                    if (data.players[i] == player || data.players[i] == player.userId){ //TODO: warn! userList changed user ids list to user list; leave old game
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
                console.log('game_manager;', 'emit round_start', data);
                this.emit('round_start', {
                    players: [
                        this.getPlayer(data.players[0]),
                        this.getPlayer(data.players[1])
                    ],
                    first: this.getPlayer(data.first),
                    id: data.id,
                    inviteData: data.inviteData
                });
                break;
            case 'turn':
                console.log('game_manager;', 'emit turn', data);
                this.emit('turn', data);
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
                console.log('game_manager', 'emit round_end', data);
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
                break;
            case 'error':
                console.log('game_manager;', 'error', data);
                break;
        }
    };


    GameManager.prototype.onGameStart = function(room){
        //TODO: check and hide invite
        room = new Room(room, this.client);
        console.log('game_manager;', 'emit game_start', room);
        this.currentRoom = room;
        this.emit('game_start', room);
        this.sendReady();
    };


    GameManager.prototype.onUserLeave = function(user){
        //TODO: check user is opponent or me
        this.currentRoom.isClosed = true;
        console.log('game_manager;', 'user_leave', this.currentRoom, user);
        if (user != this.client.getPlayer()) this.emit('user_leave', user);
        else this.leaveRoom();
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
        }
    };


    GameManager.prototype.leaveGame = function(){
        // TODO: send to server leave game, block game and wait leave message
        this.client.send('game_manager', 'leave', 'server', true);
    };


    GameManager.prototype.leaveRoom = function(){
        if (!this.currentRoom.isClosed) throw new Error('leave not closed room! '+ this.currentRoom.id);
        console.log('game_manager;', 'emit game_leave;', this.currentRoom);
        this.emit('game_leave', this.currentRoom);
        this.currentRoom = null;
    };


    GameManager.prototype.sendReady = function(){
        this.client.send('game_manager', 'ready', 'server', true);
    };


    GameManager.prototype.sendTurn = function(turn){
        this.client.send('game_manager', 'turn', 'server', turn);
    };


    GameManager.prototype.sendThrow = function(){
        this.client.send('game_manager', 'event', 'server', {type:'throw'});
    };


    GameManager.prototype.sendDraw = function(){
        this.client.send('game_manager', 'event', 'server', {type:'draw', action:'ask'});
    };


    GameManager.prototype.acceptDraw = function(){
        this.client.send('game_manager', 'event', 'server', {type:'draw', action:'accept'});
    };


    GameManager.prototype.cancelDraw = function(){
        this.client.send('game_manager', 'event', 'server', {type:'draw', action:'cancel'});
    };


    GameManager.prototype.getPlayer = function(id){
        if (this.currentRoom)
            for (var i = 0; i < this.currentRoom.players.length; i++)
                if (this.currentRoom.players[i].userId == id) return this.currentRoom.players[i];
        return null;
    };


    function Room(room, client){
        this.data = room;
        this.id = room.room;
        this.owner = client.getUser(room.owner);
        this.players = [];
        if (typeof room.players[0] == "object") this.players = room.players;
        else for (var i = 0; i < room.players.length; i++) this.players.push(client.getUser(room.players[i]));
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
        client.gameManager.on('game_start', function(){
            self.invite = null;
            self.rejectAll();
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
        if (!userId){
            console.warn('invite_manager; ', 'wrong userId to send invite', userId);
            return;
        }
        if (this.invite){
            this.cancel();
        }
        params = params || {};
        params.target = userId;
        this.invite = params;
        this.client.send('invite_manager', 'invite', userId, this.invite);
    };


    InviteManager.prototype.accept = function(userId){
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

    return InviteManager;
});
define('modules/user_list',['EE'], function(EE) {
    

    var UserList = function(client){

        var self = this;

        this.client = client;
        this.users = [];
        this.rooms = [];

        client.on('login', function(user){
            self.onUserLogin(user, true);
        });
        client.on('disconnected', function(){
            self.rooms = [];
            self.users = [];
        });
    };

    UserList.prototype  = new EE();


    UserList.prototype.onMessage = function(message){
        switch (message.type){
            case 'user_login': this.onUserLogin(message.data); break;
        }
    };


    UserList.prototype.onUserLogin = function(data, fIsPlayer){
        var user = new User(data, fIsPlayer);
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
        if (invite) {
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
            if (invite && user.userId == invite.target) {
                user.isInvited = true;
            } else delete user.isInvited;
            if (!user.isInRoom) userList.push(user);
        }
        return userList;
    };


    UserList.prototype.getRoomList = function() {
        return this.rooms;
    };


    function User(data, fIsPlayer){
        if (!data || !data.userId || !data.userName) throw new Error("wrong user data!");
        for (var key in data){
            if (data.hasOwnProperty(key)) this[key] = data[key];
        }
        this.isPlayer = fIsPlayer || false;
        this.getRank = function (mode) {
            return this[mode].rank || '—';
        }
    }

    return UserList;
});
define('modules/socket',['EE'], function(EE) {
    

    var Socket = function(opts){
        opts = opts || {};
        this.port = opts.port||'8080';
        this.domain = opts.domain || 'localhost';
        this.game = opts.game||"test";
        this.url = opts.url || this.game;

        this.isConnecting = true;
        this.isConnected = false;

    };

    Socket.prototype  = new EE();


    Socket.prototype.init = function(){
        var self = this;
        self.isConnecting = true;
        self.isConnected = false;

        try{

            this.ws = new WebSocket ('ws://'+this.domain+':'+this.port+'/'+this.url);

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


define('text!tpls/userListFree.ejs',[],function () { return '<% _.each(users, function(user) { %>\n<tr>\n    <td class="userName"><%= user.userName %></td>\n    <td class="userRank"><%= user.getRank(\'default\') %></td>\n    <% if (user.isPlayer) { %>\n    <td></td>\n    <% } else if (user.isInvited) { %>\n    <td class="inviteBtn activeInviteBtn" data-userId="<%= user.userId %>">Отмена</td>\n    <% } else { %>\n    <td class="inviteBtn" data-userId="<%= user.userId %>">Пригласить</td>\n    <% } %>\n\n</tr>\n\n<% }) %>';});


define('text!tpls/userListInGame.ejs',[],function () { return '<% _.each(rooms, function(room) { %>\n<tr>\n    <td class="userName"><%= room.players[0].userName %></td>\n    <td class="userName"><%= room.players[1].userName %></td>\n</tr>\n<% }) %>';});


define('text!tpls/userListMain.ejs',[],function () { return '<div class="tabs">\n    <div data-type="free">Свободны <span></span></div>\n    <div data-type="inGame">Играют <span></span></div>\n</div>\n<div id="userListSearch">\n    <label for="userListSearch">Поиск по списку:</label><input type="text" id="userListSearch"/>\n</div>\n<div class="tableWrap">\n    <table class="playerList"></table>\n</div>\n\n<div class="btn">\n    <span>Играть с любым</span>\n</div>';});

define('views/user_list',['underscore', 'backbone', 'text!tpls/userListFree.ejs', 'text!tpls/userListInGame.ejs', 'text!tpls/userListMain.ejs'],
    function(_, Backbone, tplFree, tplInGame, tplMain) {
    
    var UserListView = Backbone.View.extend({
        tagName: 'div',
        id: 'userList',
        tplFree: _.template(tplFree),
        tplInGame: _.template(tplInGame),
        tplMain: _.template(tplMain),
        events: {
            'click .inviteBtn': 'invitePlayer',
            'click .tabs div': 'clickTab',
            'click .disconnectButton': '_reconnect'
        },
        _reconnect: function() {
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
        invitePlayer: function(e) {
            var target = $(e.currentTarget),
                userId = target.attr('data-userId');


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
            /*
             tabType: {'free', 'inGame'}
             */
            this.$el.html(this.tplMain());
            $('body').append(this.el);

            this.ACTIVE_INVITE_CLASS = 'activeInviteBtn';
            this.ACTIVE_TAB_CLASS = 'activeTab';

            this.$list = this.$el.find('.tableWrap table');
            this.$counterFree = this.$el.find('.tabs div[data-type="free"]').find('span');
            this.$counterinGame = this.$el.find('.tabs div[data-type="inGame"]').find('span');

            this.listenTo(this.client.userList, 'new_user', bindedRender);
            this.listenTo(this.client.userList, 'leave_user', bindedRender);
            this.listenTo(this.client.inviteManager, 'reject_invite', this.onRejectInvite.bind(this));
            this.listenTo(this.client.userList, 'new_room', bindedRender);
            this.listenTo(this.client.userList, 'close_room', bindedRender);
            this.listenTo(this.client, 'disconnected', bindedRender);

            this.currentActiveTabName = 'free';
            this._setActiveTab(this.currentActiveTabName);
            this.$list.html(this.$loadingTab);
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
            console.log('render');
            this._showPlayerListByTabName();
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
                    }
                });
            }, client.opts.resultDialogDelay);

        }

        function _hideDialogs() { //TODO: hide all dialogs and messages
            $('.' + NOTIFICATION_CLASS).remove();
            $('.' + ROUNDRESULT_CLASS).remove();
            clearTimeout(dialogTimeout);
        }

        return {
            init: _subscribe
        };
    }());

    return dialogs;
});


define('text!tpls/v6-chatMain.ejs',[],function () { return '<div class="tabs">\n    <div class="tab" data-type="public">Общий чат</div>\n    <div class="tab" data-type="private" style="display: none;">игрок</div>\n</div>\n<div class="clear"></div>\n<div class="messagesWrap"><ul></ul></div>\n<div class="inputMsg" contenteditable="true"></div>\n<div class="layer1">\n    <div class="sendMsgBtn">Отправить</div>\n    <select id="chat-select">\n        <option selected>Готовые сообщения</option>\n        <option>Привет!</option>\n        <option>Молодец!</option>\n        <option>Здесь кто-нибудь умеет играть?</option>\n        <option>Кто со мной?</option>\n        <option>Спасибо!</option>\n        <option>Спасибо! Интересная игра!</option>\n        <option>Спасибо, больше играть не могу. Ухожу!</option>\n        <option>Спасибо, интересная игра! Сдаюсь!</option>\n        <option>Отличная партия. Спасибо!</option>\n        <option>Ты мог выиграть</option>\n        <option>Ты могла выиграть</option>\n        <option>Ходи!</option>\n        <option>Дай ссылку на твою страницу вконтакте</option>\n        <option>Снимаю шляпу!</option>\n        <option>Красиво!</option>\n        <option>Я восхищен!</option>\n        <option>Где вы так научились играть?</option>\n        <option>Еще увидимся!</option>\n        <option>Ухожу после этой партии. Спасибо!</option>\n        <option>Минуточку</option>\n    </select>\n</div>\n<div class="layer2">\n    <span class="chatAdmin">\n        <input type="checkbox" id="chatIsAdmin"/><label for="chatIsAdmin">От админа</label>\n    </span>\n\n    <span class="chatRules">Правила чата</span>\n</div>';});


define('text!tpls/v6-chatMsg.ejs',[],function () { return '<li class="chatMsg" data-msgId="<%= msg.msgId %>">\n    <div class="msgRow1">\n        <div class="smallRight time"><%= msg.time %></div>\n        <div class="smallRight rate"><%= (user.rate || \'—\') %></div>\n\n        <div data-userId="<%= user.userId%>">\n            <span class="userName"><%= user.userName %></span>\n        </div>\n    </div>\n    <div class="msgRow2">\n        <div class="delete">&dagger;</div>\n        <div class="msgTextWrap">\n            <span class="v6-msgText"><%= _.escape(msg.msgText) %></span>\n        </div>\n    </div>\n</li>';});

define('views/chat',['underscore', 'backbone', 'text!tpls/v6-chatMain.ejs', 'text!tpls/v6-chatMsg.ejs'],
    function(_, Backbone, tplMain, tplMsg) {
        
        var pub = [
            {
                user: {
                    userId: 1,
                    userName: 'viteck'
                },
                msg: {
                    msgId: 1,
                    msgText: 'Привет ребята!!',
                    time: '5:45'
                }
            },
            {
                user: {
                    userId: 55555555555,
                    userName: '50 cent'
                },
                msg: {
                    msgId: 52,
                    msgText: '50 cent!',
                    time: '15:40'
                }
            }
        ];
        var priv = [
            {
                user: {
                    userId: 1,
                    userName: 'viteck'
                },
                msg: {
                    msgId: 1,
                    msgText: 'Привет!',
                    time: '5:46'
                }
            },
            {
                user: {
                    userId: 55555555555,
                    userName: '50 cent'
                },
                msg: {
                    msgId: 52,
                    msgText: '<div>hack you!</div>!'
                }
            }
        ];
        var TEST_DATA = {
            pub: [],
            priv: []
        };

        var ChatView = Backbone.View.extend({
            tagName: 'div',
            id: 'v6Chat',
            tplMain: _.template(tplMain),
            tplMsg: _.template(tplMsg),
            events: {
                'click .chatMsg': '_deleteMsg',
                'click .tab': 'clickTab',
                'blur .inputMsg': 'blurInputMsg',
                'click .inputMsg': 'clickInputMsg',
                'click .sendMsgBtn': 'sendMsgEvent',
                'keyup .inputMsg': 'sendMsgEvent',
                'change #chat-select': 'changeChatSelect'
            },
            changeChatSelect: function(e) {
                var textMsg = e.target.options[e.target.selectedIndex].innerHTML;
                this.$SELECTED_OPTION.attr('selected', true);
                this.$inputMsg.text(textMsg);
            },
            sendMsgEvent: function(e) {
                var msgText = '';
                console.log("TEST FIRE", e.type);
                // e используется здесь только если нажат enter

                if (e.type === 'keyup' && e.keyCode !== 13) {
                    return;
                }

                if (this.$inputMsg.has(this.$placeHolderSpan).length) {
                    return;
                }

                msgText = this.$inputMsg.text();
                this._sendMsg(msgText);
            },
            _sendMsg: function(text) {
                if (text === '' || typeof text !== 'string') {
                    return;
                }

                console.log('now check');
                if (text.length > this.MAX_MSG_LENGTH) {
                    alert(this.MAX_LENGTH_MSG);
                    return;
                }

                this._addOneMsg({
                    user: {
                        userName: this.client.getPlayer().userName,
                        userId: 665
                    },
                    msg: {
                        msgText: text,
                        msgId: 3,
                        time: _getTime()
                    }
                });

                this._onMsgAdded();
            },
            _onMsgAdded: function() {
                this.$messagesWrap.scrollTop(this.$messagesWrap[0].scrollHeight);
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

                this._addAllMsgs(this.currentActiveTabName === 'public'? TEST_DATA.pub: TEST_DATA.priv);
            },
            invitePlayer: function(e) {
            },
            initialize: function(_client) {
                this.client = _client;
                this.$el.html(this.tplMain());

                this.MAX_MSG_LENGTH = 128;
                this.MAX_LENGTH_MSG = 'Сообщение слишком длинное (максимальная длина - 128 символов). Сократите его попробуйте снова';

                this.CLASS_DISABLED = 'disabled';
                this.CLASS_CHATADMIN = 'chatAdmin';
                this.CLASS_DELETE_CHAT_MESSAGE = 'delete';
                this.ACTIVE_TAB_CLASS = 'activeTab';

                this.$placeHolderSpan = $('<span class="placeHolderSpan">Введите ваше сообщение..</span>');

                this.$spinnerWrap = $('<li class="spinnerWrap"><div class="spinner"></div></li>');
                this.$messagesWrap = this.$el.find('.messagesWrap');
                this.$msgsList = this.$messagesWrap.find('ul');
                this.$inputMsg = this.$el.find('.inputMsg');
                this.$SELECTED_OPTION = this.$el.find('select option:selected');

                this.currentActiveTabName = 'public';
                this._setActiveTab(this.currentActiveTabName);

                $('body').append(this.el);
                this._addAllMsgs(TEST_DATA.pub);

                this.$inputMsg.empty().append(this.$placeHolderSpan);
                //this._setLoadingState();
                if (window.LogicGame && window.LogicGame.isSuperUser()) this.$el.find('.' + this.CLASS_CHATADMIN).removeClass(this.CLASS_CHATADMIN);
                window.view = this;
            },
            _setActiveTab: function(tabName) {
                this.$el.find('.tabs div').removeClass(this.ACTIVE_TAB_CLASS);
                this.$el.find('.tabs div[data-type="' + tabName + '"]').addClass(this.ACTIVE_TAB_CLASS);
            },
            render: function() {
                return this;
            },
            _deleteMsg: function(e) {
                // delete by id or as click .delete handler
                var $msg, msgId;

                if (!isNaN(+e) && typeof +e === 'number') {
                    msgId = e;
                } else {
                    //клик не по кнопке удалить
                    if (!$(e.target).hasClass(this.CLASS_DELETE_CHAT_MESSAGE)) {
                        return;
                    }

                    $msg = $(e.currentTarget);
                    msgId = $msg.attr('data-msgId')
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
            _addAllMsgs: function(msgs) {
                this.$msgsList.empty();
                _.each(msgs, function(msg) {
                    this._addOneMsg(msg);
                }, this);
            },
            _addOneMsg: function(msg) {
                var $msg = this.tplMsg(msg);
                this.$msgsList.append($msg);
            },
            _setLoadingState: function() {
                this.$msgsList.prepend(this.$spinnerWrap);
                this.$messagesWrap.addClass(this.CLASS_DISABLED);
            },
            _removeLoadingState: function() {
                this.$spinnerWrap.remove();
                this.$messagesWrap.removeClass(this.CLASS_DISABLED);
            }
        });
        return ChatView;

        //TODO use momentjs
        function _getTime(){
            var d = new Date();
            var h = d.getHours();
            var m = d.getMinutes();
            if (h < 10) h = '0' + h;
            if (m < 10) m = '0' + m;
            return h + ':' + m;
        }
    });
define('modules/views_manager',['views/user_list', 'views/dialogs', 'views/chat'], function(userListView, dialogsView, v6ChatView) {
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
    };

    return ViewsManager;
});

define('client',['modules/game_manager', 'modules/invite_manager', 'modules/user_list', 'modules/socket', 'modules/views_manager', 'EE'],
    function(GameManager, InviteManager, UserList, Socket, ViewsManager, EE) {
    
    var Client = function(opts) {
        opts.resultDialogDelay = opts.resultDialogDelay || 0;
        opts.modes = opts.modes || opts.gameModes || ['default'];

        var self = this;

        this.opts = opts;
        this.userList = new UserList(this);
        this.gameManager = new GameManager(this);
        this.inviteManager = new InviteManager(this);
        this.viewsManager = new ViewsManager(this);

        this.socket = new Socket(opts);
        this.socket.on("connection", function () {
            console.log('client;', 'socket connected');
        });

        this.socket.on("disconnection", function() {
            console.log('client;', 'socket disconnected');
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
    };

    Client.prototype  = new EE();

    Client.prototype.init = function(){
        this.socket.init();
        this.viewsManager.init();
        return this;
    };


    Client.prototype.onMessage = function(message){
        switch (message.module){
            case 'server': this.onServerMessage(message); break;
            case 'invite_manager': this.inviteManager.onMessage(message); break;
            case 'game_manager': this.gameManager.onMessage(message); break;
        }
    };


    Client.prototype.onServerMessage = function(message){
        switch (message.type){
            case 'login':
                this.onLogin(message.data.you, message.data.userlist, message.data.rooms);
                break;
            case 'user_login':
                this.userList.onUserLogin(message.data);
                break;
            case 'user_leave':
                this.userList.onUserLeave(message.data);
                break;
            case 'new_game':
                this.userList.onGameStart(message.data.room, message.data.players);
                this.gameManager.onMessage(message);
                break;
            case 'end_game':
                this.userList.onGameEnd(message.data.room, message.data.players);
                break;
        }
    };

    Client.prototype.onLogin = function(user, userlist, rooms){
        console.log('client;', 'login', user, userlist, rooms);
        var i;
        for (i = 0; i < userlist.length; i++) this.userList.onUserLogin(userlist[i]);
        for (i = 0; i< rooms.length; i++) this.userList.onGameStart(rooms[i].room, rooms[i].players);
        this.emit('login', user);
    };


    Client.prototype.send = function (module, type, target, data) {
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


    Client.prototype.getPlayer = function(){
        return this.userList.player;
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