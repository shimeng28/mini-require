// define(['./b'], function(b){
// 	console.log('in a refer b');
// 	b.say();
// 	return {
// 		say: function() {
// 			console.log('a.js');
// 		}
// 	}
// });

define(function(){
  return {
    say: function() {
      console.log('a.js');
    }
  }
});