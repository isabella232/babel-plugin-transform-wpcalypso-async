/**
 * External dependencies
 */
const kebabCase = require( 'lodash.kebabcase' );

module.exports = function( babel ) {
	const t = babel.types;

	return {
		visitor: {
			JSXAttribute: function( path ) {
				// We only transform the require prop on AsyncLoad components.
				// The component could have been imported under a different
				// name, but tracking the identifier to the import would add
				// complexity to the parsing. In other words, I'm lazy.
				const parent = path.parentPath.parent;
				if ( 'AsyncLoad' !== parent.openingElement.name.name ) {
					return;
				}

				const name = path.node.name;
				if ( 'JSXIdentifier' !== name.type || 'require' !== name.name ) {
					return;
				}

				const value = path.node.value;
				if ( 'StringLiteral' !== value.type ) {
					return;
				}

				// Replace prop string with function which, when invoked, calls
				// asyncRequire. The asyncRequire call is transformed by the
				// CallExpression visitor in this plugin
				const newValue = t.jSXExpressionContainer(
					t.functionExpression( null, [ t.identifier( 'callback' ) ], t.blockStatement( [
						t.expressionStatement( t.callExpression( t.identifier( 'asyncRequire' ), [
							value,
							t.identifier( 'callback' )
						] ) )
					] ) )
				);

				path.replaceWith( t.jSXAttribute( name, newValue ) );
			},
			CallExpression: function( path, state ) {
				if ( 'asyncRequire' !== path.node.callee.name ) {
					return;
				}

				const argument = path.node.arguments[ 0 ];
				if ( ! argument || 'StringLiteral' !== argument.type ) {
					return path.remove();
				}

				// Determine async from Babel plugin options
				const isAsync = state.opts.async;

				// In both asynchronous and synchronous case, we'll finish by
				// calling reqquire on the loaded module
				let requireCall = t.callExpression( t.identifier( 'require' ), [ argument ] );

				// If a callback was passed as an argument, wrap it as part of
				// the transformation
				const callback = path.node.arguments[ 1 ];
				if ( callback ) {
					requireCall = t.callExpression( callback, [ requireCall ] );
				}

				if ( isAsync ) {
					// Generate a chunk name based on the require path
					const chunkName = 'async-load-' + kebabCase( argument.value );

					// Transform to asynchronous require.ensure
					path.replaceWith(
						t.callExpression( t.memberExpression( t.identifier( 'require' ), t.identifier( 'ensure' ) ), [
							argument,
							t.functionExpression( null, [ t.identifier( 'require' ) ], t.blockStatement( [
								t.expressionStatement( requireCall )
							] ) ),
							t.stringLiteral( chunkName )
						] )
					);
				} else {
					// Transform to synchronous require
					path.replaceWith( requireCall );
				}
			}
		}
	};
};
