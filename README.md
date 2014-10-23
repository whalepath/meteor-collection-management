Collection manager abstraction for Meteor.

[![Build Status](https://travis-ci.org/whalepath/meteor-collection-management.svg?branch=master)](https://travis-ci.org/whalepath/meteor-collection-management)

Meteor-Collection-Management takes Meteor's concept of javascript code that runs on both the client and the server to 
the next level.

MCM target developers are organizations with some of these problems:

 1. differing skill levels 
 2. differing levels of involvement with the code - for example some developers may jump in to fix a few items before 
 working on a different project. A prime example is UX/UI designers - who do not have the time or energy
    to understand all the intricacies of proper Meteor development
 3. a medium to large number of developers
 4. competent Javascript contractors or summer interns who need to be productive quickly with minimal learning of Meteor
 5. Need to audit and provide provable security mechanisms.
 
MCM focus is on:

 1. Further reduction of duplicated code so as to allow even more code reuse between the client and the server
 than what Meteor already provides.
 
 2. Eliminate annoying avoidable errors:
 
    1. topic or method name changes.
    2. provide automatic topic/method name federation to avoid mysterious behavior with similar names.
    3. dangling subscribes - clients subscribing to topics no longer published by the server.
 
 3. Provide a standard client/server collections mechanism that offers:
 
    1. Consistent read/write to/from the database across the wire 
    2. Ability to attach security access rules
    3. Secured fields: secured fields are not modifiable by client.
    4. Consistent code for client-side only collections

 4. Cursor/Method security

    1. Security checks can be applied on both the client and the server
    2. Flexible security checks alter the cursor/method arguments to impose conditions depending on user


Subscription/Publish gaps:

 1. Code to populate a subscription on the server is duplicated on the client.
 2. The client and the server must agree on the same topic name and the same semantics. 
 3. There is no provision for orthogonally applying security checks
 
Method calls face similar issues:

 1. The client

TODO: Namespace the mcm

TODO add proper description.

# What Meteor Collection Management (MCM) is for

## Problems MCM solves
* TODO: fill out

## Problems MCM should solve
* TODO: fill out

##To maintainers
To run tests locally run following: 

```meteor test-packages ./```

## to understand
* look in lib/manager.js
* find ManagerType.createSubClass

## TODO: how to do testing on the client/ server/ manager code?



Note: meteor-package-paths ( https://www.npmjs.org/package/meteor-package-paths ) is useful to maintain the package file list.
