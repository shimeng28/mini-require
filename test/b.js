define(['./a'], function(a) {
  console.log('in b refer a');
  a.say();
  return {
    say: function() {
      console.log('b.js');
    }
  }
});