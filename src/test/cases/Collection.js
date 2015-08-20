/* global describe, before, after, it */

var should = require('should'); //eslint-disable-line
var lib = require('../../index');
var config = require('../config');
var P = require('../../Promise');

describe('Collection', function () {
  before(function (done) {
    this.db = new lib.Database(config);

    this.Posts = require('../collections/Posts')(this.db);
    this.postsData = require('../fixtures/posts');

    this.Authors = require('../collections/Authors')(this.db);
    this.authorsData = require('../fixtures/authors');

    this.db.getAdapter().loadAllFixtures([
      {
        collection: new this.Posts(),
        rows: this.postsData
      },
      {
        collection: new this.Authors(),
        rows: this.authorsData
      }
    ]).then(function () {
      done();
    }).catch(function (error) {
      throw error;
    });
  });

  after(function (done) {
    this.db.close().then(done);
  });

  it('should have an instance', function () {
    var posts = new this.Posts();
    posts.should.have.property('table').which.is.exactly('posts');
  });

  it('should have a model', function () {
    var posts = new this.Posts();
    posts.should.have.property('model');

    var post = posts.model();
    post.should.have.property('get');
  });

  it('should find all results', function (done) {
    var posts = new this.Posts();
    posts.find('all').then(function (models) {
      models.should.be.instanceOf(Array);
      models.should.have.lengthOf(3);

      var firstPost = models[0];
      firstPost.should.have.property('attributes');
      firstPost.attributes.title.should.be.exactly('Hello World');

      done();
    }).catch(function (error) {
      throw error;
    });
  });

  it('should find single result', function (done) {
    var posts = new this.Posts();
    posts.find('first', {
      conditions: {
        id: 1
      }
    }).then(function (post) {
      post.get('title').should.equal('Hello World');
      done();
    }).catch(function (error) {
      throw error;
    });
  });

  it('should find list', function (done) {
    var posts = new this.Posts();
    posts.find('list').then(function (list) {
      list.should.eql({
        1: 'Hello World',
        2: 'About',
        3: 'Contact'
      });
      done();
    }).catch(function (error) {
      throw error;
    });
  });

  it('should find count of results', function (done) {
    var posts = new this.Posts();
    posts.find('count').then(function (count) {
      count.should.equal(3);
      done();
    }).catch(function(error) {
      throw error;
    });
  });

  it('should find single result by primaryKey', function (done) {
    var posts = new this.Posts();
    var promise = posts.findById(1);

    promise.then(function (post) {
      post.get('title').should.equal('Hello World');
      done();
    }).catch(function (error) {
      throw error;
    });
  });

  it('should find single result by field', function (done) {
    var posts = new this.Posts();
    posts.findBy('title', 'Hello World').then(function (post) {
      post.get('title').should.equal('Hello World');
      done();
    }).catch(function (error) {
      throw error;
    });
  });

  it('should fire beforeSave callback', function (done) {
    var posts = new this.Posts({
      beforeSave: function (model) {
        return new P((resolve) => {
          model.set('title', 'I am new again');
          return resolve(true);
        });
      }
    });
    var post = posts.model({
      title: 'I am new'
    });

    post.save().then(function (model) {
      model.get('title').should.equal('I am new again');
      done();
    });
  });

  it('should fire afterSave callback', function (done) {
    var posts = new this.Posts({
      afterSave: function (model) {
        return new P((resolve) => {
          model.set('title', 'I am modified in afterSave');
          return resolve(true);
        });
      }
    });
    var post = posts.model({
      title: 'I am new'
    });

    post.save().then(function (model) {
      model.get('title').should.equal('I am modified in afterSave');
      done();
    });
  });

  it('should fire beforeValidate callback', function (done) {
    var posts = new this.Posts({
      beforeValidate: function (model) {
        return new P((resolve) => {
          model.set('title', 'I am modified in beforeValidate');
          return resolve(true);
        });
      }
    });
    var post = posts.model({
      title: 'I am new'
    });

    post.save().then(function (model) {
      model.get('title').should.equal('I am modified in beforeValidate');
      done();
    });
  });

  it('should fire afterValidate callback', function (done) {
    var posts = new this.Posts({
      afterValidate: function (model) {
        return new P((resolve) => {
          model.set('title', 'I am modified in afterValidate');
          return resolve(true);
        });
      }
    });
    var post = posts.model({
      title: 'I am new'
    });

    post.save().then(function (model) {
      model.get('title').should.equal('I am modified in afterValidate');
      done();
    });
  });

  it('should fire beforeDelete callback', function (done) {
    var authors = new this.Authors();
    var author = authors.model({
      id: 1
    });
    author.fetch().then(function (model) {
      model
        .delete()
        .catch(function (error) {
          error.should.eql(true);
        })
        .finally(function () {
          done();
        });
    });
  });

  it('should fire afterDelete callback', function (done) {
    var posts = new this.Posts();
    var post = posts.model({
      id: 2
    });
    post.fetch().then(function (model) {
      model
        .delete()
        .then(function () {
          model.get('_field').should.eql('afterDelete');
          done();
        });
    });
  });
});
