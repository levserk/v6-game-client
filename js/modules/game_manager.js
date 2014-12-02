function GameManager(client){
    this.client = client;
}

GameManager.prototype  = new EventEmitter();


GameManager.prototype.onMessage = function(message){

};