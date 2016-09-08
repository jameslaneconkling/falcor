var expect = require('chai').expect;
var toPaths = require('../lib/toPaths');
var template = require('../lib/template');
var pathsParser = require('../lib/paths-parser');

describe('Paths', function() {
    it('should allow null at the end of paths', function() {
        expect(toPaths`{
            value: {
                ${null}
            }
        }`).to.deep.equal([['value', null]]);
    });
    it('should allow string keys in array indexers', function() {
        expect(toPaths`{
            ['background', 'foreground']: {
                color
            }
        }`).to.deep.equal([
            ['background', 'color'],
            ['foreground', 'color'],
        ]);
    });
    it('should allow hyphens in identifier names', function() {
        expect(toPaths`{
            title-0: {
                name,
                rating,
                box-shot
            }
        }`).to.deep.equal([
            ['title-0', ['name', 'rating', 'box-shot']]
        ]);
    });
    it('should accept range to syntax', function() {
        expect(toPaths`{
            titles: {
                length,
                [0..9]: {
                    name,
                    rating,
                    box-shot
                }
            }
        }`).to.deep.equal([
            ['titles', { from:0, length:10 }, ['name', 'rating', 'box-shot']],
            ['titles', 'length']
        ]);
    });
    it('should accept range length syntax', function() {
        expect(toPaths`{
            titles: {
                length,
                [0...9]: {
                    name,
                    rating,
                    box-shot
                }
            }
        }`).to.deep.equal([
            ['titles', { from:0, length:9 }, ['name', 'rating', 'box-shot']],
            ['titles', 'length']
        ]);
    });
    it('should accept range objects and convert to => length', function() {
        var range = { from: 0, to: 9 };
        expect(toPaths`{
            titles: {
                length,
                [${range}]: {
                    name,
                    rating,
                    box-shot
                }
            }
        }`).to.deep.equal([
            ['titles', { from:0, length:10 }, ['name', 'rating', 'box-shot']],
            ['titles', 'length']
        ]);
    });
    it('should invert backwards ranges', function() {

        expect(toPaths`{
            titles: {
                length,
                [9..0]: {
                    name,
                    rating,
                    box-shot
                }
            }
        }`).to.deep.equal([
            ['titles', { from:0, length:10 }, ['name', 'rating', 'box-shot']],
            ['titles', 'length']
        ]);
    });
    it('should do all the things at once', function() {
        var range = { from: 10, to: 9 };

        expect(toPaths`{
            genreLists: {
                length,
                [10...1]: {
                    name,
                    rating,
                    color: { ${null} },
                    titles: {
                        length,
                        [${range}]: {
                            name,
                            rating,
                            box-shot
                        }
                    }
                }
            }
        }`).to.deep.equal([
            ['genreLists', { from: 1, length: 9 }, 'color', null],
            ['genreLists', { from: 1, length: 9 }, 'titles', { from: 9, length: 2 }, ['name', 'rating', 'box-shot']],
            ['genreLists', { from: 1, length: 9 }, 'titles', 'length'],
            ['genreLists', { from: 1, length: 9 }, ['name', 'rating']],
            ['genreLists', 'length']
        ]);

        expect(pathsParser.parse(template`{
            genreLists: {
                length,
                [10...1]: {
                    name,
                    rating,
                    color: { ${null} },
                    titles: {
                        length,
                        [${range}]: {
                            name,
                            rating,
                            box-shot
                        }
                    }
                }
            }
        }`)).to.deep.equal({
            '0': {
                '1': {
                    '2': {
                        $keys: [null]
                    },
                    '3': {
                        '1': {
                            '$keys': ['name', 'rating', 'box-shot']
                        },
                        '$keys': ['length', { from: 9, length: 2 }]
                    },
                    '$keys': ['name', 'rating', 'color', 'titles']
                },
                '$keys': ['length', { from: 1, length: 9 }]
            },
            '$keys': ['genreLists']
        });
    });
});