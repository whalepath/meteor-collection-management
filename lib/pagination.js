// TODO: make an object so can detect instanceof on the server
Mcm_Pagination = function(options) {
    var pagination = {};
    // skip and limit are Mongo options on queries (also ensure that skip is a number)
    pagination.skip = options? Number(options.skip) || 0 : 0;
    pagination.limit = 30;
    return pagination;
}