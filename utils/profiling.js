var async = require('async');

var ProfilingContext = function() {
	this.timestamps = [];
	this.timerCollection = [];
	this.functions = [];
	this.initialTimestamp = null;
};

ProfilingContext.prototype.initial = function() {
	this.initialTimestamp = Math.floor(parseInt(process.hrtime().join(''))/1000);
};

ProfilingContext.prototype.addMark = function(name) {
	var timestamp = Math.floor(parseInt(process.hrtime().join(''))/1000);
	if (!this.timestamps.length)
		this.timerCollection.push(timestamp - this.initialTimestamp);
	else
		this.timerCollection.push(timestamp - this.timestamps[this.timestamps.length-1]);
	this.timestamps.push(timestamp);
	this.functions.push(name);
};

ProfilingContext.prototype.show = function() {
	var self = this;
	async.reduce(this.timerCollection, 0, function(memo, item, c) {
		c(null, memo+item);
	}, function(err, totalTime) {
		console.log('Total time: '+totalTime+' μs');
		self.functions.forEach(function(item, index) {
			console.log('['+item+']: '+self.timerCollection[index]+' μs ('+((self.timerCollection[index]/totalTime*100).toPrecision(3)+'%')+')');
		});
	});
};

module.exports = ProfilingContext;
