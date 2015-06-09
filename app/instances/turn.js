define([], function() {
    var Turn = function(turn, user, nextPlayer){
        this.user = user;
        this.nextPlayer = nextPlayer;
        this.turn = turn;
        delete this.turn.nextPlayer;
    };
    return Turn;
});