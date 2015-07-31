define(['EE', 'underscore'], function(EE, _) {
    'use strict';

    var SoundManager = function (client) {
        this.client = client;
        this.soundsList = client.opts.sounds || {};
        this.sounds = {};
        this.initSounds();
        this.volume = 1;
        this.sound = null;
        this.msAlerTimeBound = 15000;

        this.client.gameManager.on('game_start', function(room){
            if (room.isPlayer) this._playSound('start');
        }.bind(this));

        this.client.gameManager.on('turn', function(){
            this._playSound('turn');
        }.bind(this));

        this.client.inviteManager.on('new_invite', function(data){
            this._playSound('invite');
        }.bind(this));

        this.client.gameManager.on('time', _.throttle(function(data){       // alert sound time bound in one second
            if (data.user == client.getPlayer() && data.userTimeMS <= this.msAlerTimeBound && data.userTimeMS > 1000) {
                this._playSound('timeout', 0.5 + (this.msAlerTimeBound - data.userTimeMS) / this.msAlerTimeBound / 2);
            }
        }.bind(this), 1000));
    };

    SoundManager.prototype = new EE();


    SoundManager.prototype.initSounds = function(){
        for (var id in this.soundsList) {
            if (this.soundsList.hasOwnProperty(id))
                this.sounds[id] = new Sound(this.soundsList[id], id);
        }
    };


    SoundManager.prototype._playSound = function(id){
        // check auto play sound enable
        if (this.sounds[id] && this.sounds[id].enable)
            this.playSound(id);
    };


    SoundManager.prototype.playSound = function(id, volume){
        if (!this.client.settings.sounds) return;
        volume = volume || this.volume;
        if (!this.sounds[id]){
            console.error('sound_manager;', 'wrong sound id', id);
            return;
        }
        if (this.sound)
            this.sound.stop();
        this.sound = this.sounds[id].play(volume);
    };


    var Sound = function (data, id){
        this.volume = data.volume || 1;
        this.sound = document.createElement('audio');
        this.sound.id = 'sound-'+id;
        this.sound.src = data.src;
        this.enable = data.enable !== false;
        document.body.appendChild(this.sound);
    };

    Sound.prototype.play = function(volume) {
        volume *= this.volume;
        if (volume < 0 || volume > 1) volume = 1;
        try {
            this.sound.currentTime = 0;
            this.sound.volume = volume;
            this.sound.play();
            return this;
        } catch (e) {
            console.error('sound;', 'sound play error', e);
            return null;
        }
    };

    Sound.prototype.stop = function() {
        try {
            this.sound.pause()
        } catch (e) {
            console.error('sound;', 'sound stop error', e);
        }
    };

    return SoundManager;
});