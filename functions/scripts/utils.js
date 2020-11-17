const _ = require('lodash');

/**
 * Merge two array of object with a key
 * @tab {array} 
 * @tab2 {array} 
 * @keyId {string} 
 */
function mergeArraysByKeyId(tab, tab2, keyId) {
  _.mixin({
    mergeByKey(arr1, arr2, key) {
      const criteria = {};
      criteria[key] = null;
      return _.map(arr1, function (item) {
        criteria[key] = item[key];
        return _.merge(item, _.find(arr2, criteria));
      });
    },
  });
  return _.mergeByKey(tab, tab2, keyId);
}


exports.mergeArraysByKeyId = mergeArraysByKeyId;