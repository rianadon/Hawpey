/*globals describe, before, it */
"use strict";

const request = require('request');
const expect = require('expect.js');
const fs = require('fs');
const child_process = require('child_process');
const httpUtils = require('request-mocha')(request);

const crt = fs.readFileSync('device/cert.crt');

const program = fs.readFileSync(__dirname+"/../device/program.js").toString();

function startServer(done) {
	const proc = child_process.spawn("node", ["device/server.js"], {detached: false});
	proc.stdout.on('data', (data) => {
		if(~data.toString().indexOf("Listening on port")) done();
	});
	proc.stderr.on('data', (data) => {
		console.log(data.toString());
	});
	proc.on('close', () => {
		throw new Error("Server unexpectedly stopped.");
	});
}
describe('Variables', function() {
	before(startServer);
	describe('List all', function() {
		httpUtils.save({
			url: 'https://localhost:2000/variables',
			ca: crt
		});
		it('Returned everything', function() {
	    expect(this.err).to.equal(null);
	    expect(this.res.statusCode).to.equal(200);
			expect(JSON.parse(this.body)).to.eql({test: {validator: "^[a-z]*$", value: "hello"}});
	  });
	});
	describe('List one', function() {
		httpUtils.save({
			url: 'https://localhost:2000/variables/test',
			ca: crt
		});
		it('Returned correct one', function() {
			expect(this.err).to.equal(null);
			expect(this.res.statusCode).to.equal(200);
			expect(JSON.parse(this.body)).to.eql({validator: "^[a-z]*$", value: "hello"});
		});
	});
	describe('List incorrect one', function() {
		httpUtils.save({
			url: 'https://localhost:2000/variables/incorrect',
			ca: crt
		});
		it('Gave an error', function() {
			expect(this.err).to.equal(null);
			expect(this.res.statusCode).to.equal(404);
		});
	});
	describe('Modify one incorrectly', function() {
		httpUtils.save({
			method: 'PUT',
			url: 'https://localhost:2000/variables/test',
			json: {"value": "high5"},
			ca: crt
		});
	  it('Gave an error', function() {
	    expect(this.err).to.equal(null);
			expect(this.res.statusCode).to.equal(400);
	  });
	});
	describe('Modify incorrect one', function() {
		httpUtils.save({
			method: 'PUT',
			url: 'https://localhost:2000/variables/incorrect',
			json: {"value": "hello"},
			ca: crt
		});
	  it('Gave an error', function() {
	    expect(this.err).to.equal(null);
			expect(this.res.statusCode).to.equal(404);
	  });
	});
	describe('Modify one', function() {
		httpUtils.save({
			method: 'PUT',
			url: 'https://localhost:2000/variables/test',
			json: {"value": "hi"},
			ca: crt
		});
	  it('Modified it', function() {
	    expect(this.err).to.equal(null);
	    expect(this.res.statusCode).to.equal(204);
	  });
		describe('Check if modified', function() {
			httpUtils.save({
				url: 'https://localhost:2000/variables/test',
				ca: crt
			});
		  it('Is modified', function() {
		    expect(this.err).to.equal(null);
		    expect(this.res.statusCode).to.equal(200);
				expect(JSON.parse(this.body)).to.eql({validator: "^[a-z]*$", value: "hi"});
		  });
		});
	});
});
describe('Controls', function() {
	describe('List all', function() {
		httpUtils.save({
			url: 'https://localhost:2000/controls',
			ca: crt
		});
		it('Returned everything', function() {
	    expect(this.err).to.equal(null);
	    expect(this.res.statusCode).to.equal(200);
			expect(JSON.parse(this.body)).to.eql({"A control": {type: "boolean"}});
	  });
	});
	describe('List one', function() {
		httpUtils.save({
			url: 'https://localhost:2000/controls/A%20control',
			ca: crt
		});
		it('Returned correct one', function() {
			expect(this.err).to.equal(null);
			expect(this.res.statusCode).to.equal(200);
			expect(JSON.parse(this.body)).to.eql({type: "boolean"});
		});
	});
	describe('List incorrect one', function() {
		httpUtils.save({
			url: 'https://localhost:2000/controls/incorrect',
			ca: crt
		});
		it('Gave an error', function() {
			expect(this.err).to.equal(null);
			expect(this.res.statusCode).to.equal(404);
		});
	});
	describe('Modify one incorrectly', function() {
		httpUtils.save({
			method: 'PUT',
			url: 'https://localhost:2000/controls/A%20control',
			json: {"value": 100},
			ca: crt
		});
	  it('Gave an error', function() {
	    expect(this.err).to.equal(null);
			expect(this.res.statusCode).to.equal(400);
	  });
	});
	describe('Modify incorrect one', function() {
		httpUtils.save({
			method: 'PUT',
			url: 'https://localhost:2000/controls/incorrect',
			json: {"value": true},
			ca: crt
		});
	  it('Gave an error', function() {
	    expect(this.err).to.equal(null);
			expect(this.res.statusCode).to.equal(404);
	  });
	});
	describe('Modify one', function() {
		httpUtils.save({
			method: 'PUT',
			url: 'https://localhost:2000/controls/A%20control',
			json: {"value": true},
			ca: crt
		});
	  it('Modified it', function() {
	    expect(this.err).to.equal(null);
	    expect(this.res.statusCode).to.equal(200);
	    expect(this.body).to.eql({value: true});
	  });
	});
});
describe('Dependencies', function() {
	describe.skip('Add one', function() {
		this.timeout(5000);
		httpUtils.save({
			method: 'POST',
			url: 'https://localhost:2000/dependencies',
			json: {"name": "color"},
			ca: crt
		});
	  it('Added it', function() {
	    expect(this.err).to.equal(null);
	    expect(this.res.statusCode).to.equal(201);
	  });
		describe('Remove it', function() {
			httpUtils.save({
				method: 'DELETE',
				url: 'https://localhost:2000/dependencies/color',
				ca: crt
			});
		  it('Deleted it', function() {
		    expect(this.err).to.equal(null);
		    expect(this.res.statusCode).to.equal(204);
		  });
		});
	});
	describe('Remove incorrect one', function() {
		httpUtils.save({
			method: 'DELETE',
			url: 'https://localhost:2000/dependencies/dne',
			ca: crt
		});
		it('Returned an error', function() {
			expect(this.err).to.equal(null);
			expect(this.res.statusCode).to.equal(404);
		});
	});
});
describe('Programs', function() {
	describe('Retrieve it', function() {
		httpUtils.save({
			url: 'https://localhost:2000/program',
			ca: crt
		});
		it('Returned correct program', function() {
			expect(this.err).to.equal(null);
			expect(this.res.statusCode).to.equal(200);
			expect(this.res.headers['content-type']).to.equal('text/plain');
			expect(this.body).to.equal(program);
		});
	});
	describe('Replace it with itself', function() {
		httpUtils.save({
			method: 'PUT',
			url: 'https://localhost:2000/program',
			body: program,
			headers: {
				'Content-Type': 'text/plain'
			},
			ca: crt
		});
		it('Replaced it', function() {
			expect(this.err).to.equal(null);
			expect(this.res.statusCode).to.equal(204);
		});
	});
});
