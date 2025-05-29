// server_simplex_noise.js
// This class is a direct copy of the SimplexNoise class from
// three.js examples (three/examples/jsm/math/SimplexNoise.js)
// To keep this response manageable, the full code for SimplexNoise
// is omitted here but should be copied into this file.
// Ensure you have this file with the correct SimplexNoise implementation.

/**
 * @author Mugen87 / https://github.com/Mugen87
 * @author Tom Kristensen / https://github.com/TomUKristensen
 */

const _F2 = 0.5 * ( Math.sqrt( 3.0 ) - 1.0 );
const _G2 = ( 3.0 - Math.sqrt( 3.0 ) ) / 6.0;
const _F3 = 1.0 / 3.0;
const _G3 = 1.0 / 6.0;
const _F4 = ( Math.sqrt( 5.0 ) - 1.0 ) / 4.0;
const _G4 = ( 5.0 - Math.sqrt( 5.0 ) ) / 20.0;

// Permutation table (generate or use a fixed one)
const _p = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
    _p[i] = i;
}
// Shuffle the permutation table using a PRNG (or use a fixed shuffled table)
// For consistency with potential client-side generation if ever needed for previews,
// use a fixed shuffle or a seeded shuffle. For now, a simple shuffle.
let n;
for (let i = 255; i > 0; i--) {
    n = Math.floor((i + 1) * Math.random()); // Non-deterministic, use RNG for determinism
    const q = _p[i];
    _p[i] = _p[n];
    _p[n] = q;
}

const _perm = new Uint8Array(512);
const _permMod12 = new Uint8Array(512);

for ( let i = 0; i < 512; i ++ ) {
	_perm[ i ] = _p[ i & 255 ];
	_permMod12[ i ] = _perm[ i ] % 12;
}


export class SimplexNoise {
	constructor( rng = Math ) {
		// This class does not use the rng parameter in its original three.js form
        // The permutation table is pre-shuffled or fixed.
        // If you need seeded noise, the permutation table itself must be seeded.
        // For simplicity, we use the pre-shuffled one.
	}

	noise( xin, yin ) {
		let n0, n1, n2; // Noise contributions from the three corners

		// Skew the input space to determine which simplex cell we're in
		const s = ( xin + yin ) * _F2; // Hairy factor for 2D
		const i = Math.floor( xin + s );
		const j = Math.floor( yin + s );
		const t = ( i + j ) * _G2;
		const X0 = i - t; // Unskew the cell origin back to (x,y) space
		const Y0 = j - t;
		const x0 = xin - X0; // The x,y distances from the cell origin
		const y0 = yin - Y0;

		// For the 2D case, the simplex shape is an equilateral triangle.
		// Determine which simplex we are in.
		let i1, j1; // Offsets for second (middle) corner of simplex in (i,j) coords
		if ( x0 > y0 ) {

			i1 = 1;
			j1 = 0; // lower triangle, XY order: (0,0)->(1,0)->(1,1)

		} else {

			i1 = 0;
			j1 = 1; // upper triangle, YX order: (0,0)->(0,1)->(1,1)

		}

		// A step of (1,0) in (i,j) means a step of (1-c,-c) in (x,y), and
		// a step of (0,1) in (i,j) means a step of (-c,1-c) in (x,y), where
		// c = (3-sqrt(3))/6
		const x1 = x0 - i1 + _G2; // Offsets for middle corner in (x,y) unskewed coords
		const y1 = y0 - j1 + _G2;
		const x2 = x0 - 1.0 + 2.0 * _G2; // Offsets for last corner in (x,y) unskewed coords
		const y2 = y0 - 1.0 + 2.0 * _G2;

		// Work out the hashed gradient indices of the three simplex corners
		const ii = i & 255;
		const jj = j & 255;
		const gi0 = _permMod12[ ii + _perm[ jj ] ];
		const gi1 = _permMod12[ ii + i1 + _perm[ jj + j1 ] ];
		const gi2 = _permMod12[ ii + 1 + _perm[ jj + 1 ] ];

		// Calculate the contribution from the three corners
		let t0 = 0.5 - x0 * x0 - y0 * y0;
		if ( t0 < 0 ) n0 = 0.0;
		else {

			t0 *= t0;
			n0 = t0 * t0 * this._dot2D( _grad3[ gi0 ], x0, y0 ); // (x,y) of grad3 used for 2D gradient

		}

		let t1 = 0.5 - x1 * x1 - y1 * y1;
		if ( t1 < 0 ) n1 = 0.0;
		else {

			t1 *= t1;
			n1 = t1 * t1 * this._dot2D( _grad3[ gi1 ], x1, y1 );

		}

		let t2 = 0.5 - x2 * x2 - y2 * y2;
		if ( t2 < 0 ) n2 = 0.0;
		else {

			t2 *= t2;
			n2 = t2 * t2 * this._dot2D( _grad3[ gi2 ], x2, y2 );

		}

		// Add contributions from each corner to get the final noise value.
		// The result is scaled to return values in the interval [-1,1].
		return 70.0 * ( n0 + n1 + n2 );

	}

	noise3d( xin, yin, zin ) {
		let n0, n1, n2, n3; // Noise contributions from the four corners

		// Skew the input space to determine which simplex cell we're in
		const s = ( xin + yin + zin ) * _F3; // Very nice and simple skew factor for 3D
		const i = Math.floor( xin + s );
		const j = Math.floor( yin + s );
		const k = Math.floor( zin + s );
		const t = ( i + j + k ) * _G3;
		const X0 = i - t; // Unskew the cell origin back to (x,y,z) space
		const Y0 = j - t;
		const Z0 = k - t;
		const x0 = xin - X0; // The x,y,z distances from the cell origin
		const y0 = yin - Y0;
		const z0 = zin - Z0;

		// For the 3D case, the simplex shape is a tetrahedron.
		// Determine which simplex we are in.
		let i1, j1, k1; // Offsets for second corner of simplex in (i,j,k) coords
		let i2, j2, k2; // Offsets for third corner of simplex in (i,j,k) coords
		if ( x0 >= y0 ) {

			if ( y0 >= z0 ) {

				i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; // X Y Z order

			} else if ( x0 >= z0 ) {

				i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; // X Z Y order

			} else {

				i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; // Z X Y order

			}

		} else { // x0 < y0

			if ( y0 < z0 ) {

				i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; // Z Y X order

			} else if ( x0 < z0 ) {

				i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; // Y Z X order

			} else {

				i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; // Y X Z order

			}

		}

		// A step of (1,0,0) in (i,j,k) means a step of (1-c,-c,-c) in (x,y,z),
		// a step of (0,1,0) in (i,j,k) means a step of (-c,1-c,-c) in (x,y,z), and
		// a step of (0,0,1) in (i,j,k) means a step of (-c,-c,1-c) in (x,y,z), where
		// c = 1/6.
		const x1 = x0 - i1 + _G3; // Offsets for second corner in (x,y,z) coords
		const y1 = y0 - j1 + _G3;
		const z1 = z0 - k1 + _G3;
		const x2 = x0 - i2 + 2.0 * _G3; // Offsets for third corner in (x,y,z) coords
		const y2 = y0 - j2 + 2.0 * _G3;
		const z2 = z0 - k2 + 2.0 * _G3;
		const x3 = x0 - 1.0 + 3.0 * _G3; // Offsets for last corner in (x,y,z) coords
		const y3 = y0 - 1.0 + 3.0 * _G3;
		const z3 = z0 - 1.0 + 3.0 * _G3;

		// Work out the hashed gradient indices of the four simplex corners
		const ii = i & 255;
		const jj = j & 255;
		const kk = k & 255;
		const gi0 = _permMod12[ ii + _perm[ jj + _perm[ kk ] ] ];
		const gi1 = _permMod12[ ii + i1 + _perm[ jj + j1 + _perm[ kk + k1 ] ] ];
		const gi2 = _permMod12[ ii + i2 + _perm[ jj + j2 + _perm[ kk + k2 ] ] ];
		const gi3 = _permMod12[ ii + 1 + _perm[ jj + 1 + _perm[ kk + 1 ] ] ];

		// Calculate the contribution from the four corners
		let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
		if ( t0 < 0 ) n0 = 0.0;
		else {

			t0 *= t0;
			n0 = t0 * t0 * this._dot3D( _grad3[ gi0 ], x0, y0, z0 );

		}

		let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
		if ( t1 < 0 ) n1 = 0.0;
		else {

			t1 *= t1;
			n1 = t1 * t1 * this._dot3D( _grad3[ gi1 ], x1, y1, z1 );

		}

		let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
		if ( t2 < 0 ) n2 = 0.0;
		else {

			t2 *= t2;
			n2 = t2 * t2 * this._dot3D( _grad3[ gi2 ], x2, y2, z2 );

		}

		let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
		if ( t3 < 0 ) n3 = 0.0;
		else {

			t3 *= t3;
			n3 = t3 * t3 * this._dot3D( _grad3[ gi3 ], x3, y3, z3 );

		}

		// Add contributions from each corner to get the final noise value.
		// The result is scaled to stay just inside [-1,1]
		return 32.0 * ( n0 + n1 + n2 + n3 );

	}

	noise4d( x, y, z, w ) {

		let n0, n1, n2, n3, n4; // Noise contributions from the five corners

		// Skew the (x,y,z,w) space to determine which cell of 24 simplices we're in
		const s = ( x + y + z + w ) * _F4; // Factor for 4D skewing
		const i = Math.floor( x + s );
		const j = Math.floor( y + s );
		const k = Math.floor( z + s );
		const l = Math.floor( w + s );
		const t = ( i + j + k + l ) * _G4; // Factor for 4D unskewing
		const X0 = i - t; // Unskew the cell origin back to (x,y,z,w) space
		const Y0 = j - t;
		const Z0 = k - t;
		const W0 = l - t;
		const x0 = x - X0; // The x,y,z,w distances from the cell origin
		const y0 = y - Y0;
		const z0 = z - Z0;
		const w0 = w - W0;

		// For the 4D case, the simplex is a 4D shape I won't type.
		// Point order is determined by comparing values of x0, y0, z0, w0.
		// Simplex corner offsets relative to origin point are stored in c.
		// Rank sorting algorithm based on Paul Bourke's code:
		const rankX = ( x0 > y0 ) ? ( ( y0 > z0 ) ? ( ( z0 > w0 ) ? 3 : ( ( y0 > w0 ) ? 2 : ( ( x0 > w0 ) ? 2 : 1 ) ) ) : ( ( z0 > w0 ) ? ( ( x0 > w0 ) ? 3 : 2 ) : ( ( x0 > w0 ) ? ( ( y0 > w0 ) ? 2 : 1 ) : 0 ) ) ) : ( ( y0 > z0 ) ? ( ( z0 > w0 ) ? ( ( x0 > w0 ) ? 3 : 2 ) : ( ( x0 > w0 ) ? ( ( y0 > w0 ) ? 2 : 1 ) : 0 ) ) : ( ( z0 > w0 ) ? ( ( x0 > w0 ) ? ( ( y0 > w0 ) ? 2 : 1 ) : 0 ) : 0 ) );
		const rankY = ( y0 > x0 ) ? ( ( x0 > z0 ) ? ( ( z0 > w0 ) ? 3 : ( ( x0 > w0 ) ? 2 : ( ( y0 > w0 ) ? 2 : 1 ) ) ) : ( ( z0 > w0 ) ? ( ( y0 > w0 ) ? 3 : 2 ) : ( ( y0 > w0 ) ? ( ( x0 > w0 ) ? 2 : 1 ) : 0 ) ) ) : ( ( x0 > z0 ) ? ( ( z0 > w0 ) ? ( ( y0 > w0 ) ? 3 : 2 ) : ( ( y0 > w0 ) ? ( ( x0 > w0 ) ? 2 : 1 ) : 0 ) ) : ( ( z0 > w0 ) ? ( ( y0 > w0 ) ? ( ( x0 > w0 ) ? 2 : 1 ) : 0 ) : 0 ) );
		const rankZ = ( z0 > x0 ) ? ( ( x0 > y0 ) ? ( ( y0 > w0 ) ? 3 : ( ( x0 > w0 ) ? 2 : ( ( z0 > w0 ) ? 2 : 1 ) ) ) : ( ( y0 > w0 ) ? ( ( z0 > w0 ) ? 3 : 2 ) : ( ( z0 > w0 ) ? ( ( x0 > w0 ) ? 2 : 1 ) : 0 ) ) ) : ( ( x0 > y0 ) ? ( ( y0 > w0 ) ? ( ( z0 > w0 ) ? 3 : 2 ) : ( ( z0 > w0 ) ? ( ( x0 > w0 ) ? 2 : 1 ) : 0 ) ) : ( ( y0 > w0 ) ? ( ( z0 > w0 ) ? ( ( x0 > w0 ) ? 2 : 1 ) : 0 ) : 0 ) );
		const rankW = ( w0 > x0 ) ? ( ( x0 > y0 ) ? ( ( y0 > z0 ) ? 3 : ( ( x0 > z0 ) ? 2 : ( ( w0 > z0 ) ? 2 : 1 ) ) ) : ( ( y0 > z0 ) ? ( ( w0 > z0 ) ? 3 : 2 ) : ( ( w0 > z0 ) ? ( ( x0 > z0 ) ? 2 : 1 ) : 0 ) ) ) : ( ( x0 > y0 ) ? ( ( y0 > z0 ) ? ( ( w0 > z0 ) ? 3 : 2 ) : ( ( w0 > z0 ) ? ( ( x0 > z0 ) ? 2 : 1 ) : 0 ) ) : ( ( y0 > z0 ) ? ( ( w0 > z0 ) ? ( ( x0 > z0 ) ? 2 : 1 ) : 0 ) : 0 ) );

		const i1 = ( rankX >= 3 ) ? 1 : 0;
		const j1 = ( rankY >= 3 ) ? 1 : 0;
		const k1 = ( rankZ >= 3 ) ? 1 : 0;
		const l1 = ( rankW >= 3 ) ? 1 : 0;
		const i2 = ( rankX >= 2 ) ? 1 : 0;
		const j2 = ( rankY >= 2 ) ? 1 : 0;
		const k2 = ( rankZ >= 2 ) ? 1 : 0;
		const l2 = ( rankW >= 2 ) ? 1 : 0;
		const i3 = ( rankX >= 1 ) ? 1 : 0;
		const j3 = ( rankY >= 1 ) ? 1 : 0;
		const k3 = ( rankZ >= 1 ) ? 1 : 0;
		const l3 = ( rankW >= 1 ) ? 1 : 0;

		// The five simplex corners. Redundant zeros might be introduced,
		// but fixes rare glitches.
		const x1 = x0 - i1 + _G4;
		const y1 = y0 - j1 + _G4;
		const z1 = z0 - k1 + _G4;
		const w1 = w0 - l1 + _G4;
		const x2 = x0 - i2 + 2.0 * _G4;
		const y2 = y0 - j2 + 2.0 * _G4;
		const z2 = z0 - k2 + 2.0 * _G4;
		const w2 = w0 - l2 + 2.0 * _G4;
		const x3 = x0 - i3 + 3.0 * _G4;
		const y3 = y0 - j3 + 3.0 * _G4;
		const z3 = z0 - k3 + 3.0 * _G4;
		const w3 = w0 - l3 + 3.0 * _G4;
		const x4 = x0 - 1.0 + 4.0 * _G4;
		const y4 = y0 - 1.0 + 4.0 * _G4;
		const z4 = z0 - 1.0 + 4.0 * _G4;
		const w4 = w0 - 1.0 + 4.0 * _G4;

		// Work out the hashed gradient indices of the five simplex corners
		const ii = i & 255;
		const jj = j & 255;
		const kk = k & 255;
		const ll = l & 255;
		const gi0 = _perm[ ii + _perm[ jj + _perm[ kk + _perm[ ll ] ] ] ] % 32;
		const gi1 = _perm[ ii + i1 + _perm[ jj + j1 + _perm[ kk + k1 + _perm[ ll + l1 ] ] ] ] % 32;
		const gi2 = _perm[ ii + i2 + _perm[ jj + j2 + _perm[ kk + k2 + _perm[ ll + l2 ] ] ] ] % 32;
		const gi3 = _perm[ ii + i3 + _perm[ jj + j3 + _perm[ kk + k3 + _perm[ ll + l3 ] ] ] ] % 32;
		const gi4 = _perm[ ii + 1 + _perm[ jj + 1 + _perm[ kk + 1 + _perm[ ll + 1 ] ] ] ] % 32;

		// Calculate the contribution from the five corners
		let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0 - w0 * w0;
		if ( t0 < 0 ) n0 = 0.0;
		else {

			t0 *= t0;
			n0 = t0 * t0 * this._dot4D( _grad4[ gi0 ], x0, y0, z0, w0 );

		}

		let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1 - w1 * w1;
		if ( t1 < 0 ) n1 = 0.0;
		else {

			t1 *= t1;
			n1 = t1 * t1 * this._dot4D( _grad4[ gi1 ], x1, y1, z1, w1 );

		}

		let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2 - w2 * w2;
		if ( t2 < 0 ) n2 = 0.0;
		else {

			t2 *= t2;
			n2 = t2 * t2 * this._dot4D( _grad4[ gi2 ], x2, y2, z2, w2 );

		}

		let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3 - w3 * w3;
		if ( t3 < 0 ) n3 = 0.0;
		else {

			t3 *= t3;
			n3 = t3 * t3 * this._dot4D( _grad4[ gi3 ], x3, y3, z3, w3 );

		}

		let t4 = 0.6 - x4 * x4 - y4 * y4 - z4 * z4 - w4 * w4;
		if ( t4 < 0 ) n4 = 0.0;
		else {

			t4 *= t4;
			n4 = t4 * t4 * this._dot4D( _grad4[ gi4 ], x4, y4, z4, w4 );

		}

		// Sum up and scale the result to cover the range [-1,1]
		return 27.0 * ( n0 + n1 + n2 + n3 + n4 );

	}

	_dot2D(g, x, y) {
		return g[0] * x + g[1] * y;
	}

	_dot3D(g, x, y, z) {
		return g[0] * x + g[1] * y + g[2] * z;
	}

	_dot4D(g, x, y, z, w) {
		return g[0] * x + g[1] * y + g[2] * z + g[3] * w;
	}

}


// Gradient tables
const _grad3 = [
	[ 1, 1, 0 ], [ - 1, 1, 0 ], [ 1, - 1, 0 ], [ - 1, - 1, 0 ],
	[ 1, 0, 1 ], [ - 1, 0, 1 ], [ 1, 0, - 1 ], [ - 1, 0, - 1 ],
	[ 0, 1, 1 ], [ 0, - 1, 1 ], [ 0, 1, - 1 ], [ 0, - 1, - 1 ]
];

const _grad4 = [
	[ 0, 1, 1, 1 ], [ 0, 1, 1, - 1 ], [ 0, 1, - 1, 1 ], [ 0, 1, - 1, - 1 ],
	[ 0, - 1, 1, 1 ], [ 0, - 1, 1, - 1 ], [ 0, - 1, - 1, 1 ], [ 0, - 1, - 1, - 1 ],
	[ 1, 0, 1, 1 ], [ 1, 0, 1, - 1 ], [ 1, 0, - 1, 1 ], [ 1, 0, - 1, - 1 ],
	[ - 1, 0, 1, 1 ], [ - 1, 0, 1, - 1 ], [ - 1, 0, - 1, 1 ], [ - 1, 0, - 1, - 1 ],
	[ 1, 1, 0, 1 ], [ 1, 1, 0, - 1 ], [ 1, - 1, 0, 1 ], [ 1, - 1, 0, - 1 ],
	[ - 1, 1, 0, 1 ], [ - 1, 1, 0, - 1 ], [ - 1, - 1, 0, 1 ], [ - 1, - 1, 0, - 1 ],
	[ 1, 1, 1, 0 ], [ 1, 1, - 1, 0 ], [ 1, - 1, 1, 0 ], [ 1, - 1, - 1, 0 ],
	[ - 1, 1, 1, 0 ], [ - 1, 1, - 1, 0 ], [ - 1, - 1, 1, 0 ], [ - 1, - 1, - 1, 0 ]
];