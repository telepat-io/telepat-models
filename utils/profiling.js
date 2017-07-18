const async = require('async');

class ProfilingContext {
    constructor() {
        this.timestamps = [];
        this.timerCollection = [];
        this.functions = [];
        this.initialTimestamp = null;
    }

    initial() {
        this.initialTimestamp = Math.floor(parseInt(process.hrtime().join(''))/1000);
    }

    addMark(name) {
        let timestamp = Math.floor(parseInt(process.hrtime().join(''))/1000);
        if (!this.timestamps.length)
            this.timerCollection.push(timestamp - this.initialTimestamp);
        else
            this.timerCollection.push(timestamp - this.timestamps[this.timestamps.length-1]);
        this.timestamps.push(timestamp);
        this.functions.push(name);
    }

    show() {
        let self = this;
        async.reduce(this.timerCollection, 0, (memo, item, c) => {
            c(null, memo+item);
        }, (err, totalTime) => {
            console.log(`Total time: ${totalTime} μs`);
            self.functions.forEach((item, index) => {
                console.log(`[${item}]: ${self.timerCollection[index]} μs (${(self.timerCollection[index]/totalTime*100).toPrecision(3)}%)`);
            });
        });
    }
}

module.exports = ProfilingContext;
