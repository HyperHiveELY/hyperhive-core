import {describe,it,expect} from 'vitest';
import {canonicalView,destinationGroup,primaryDestinations} from '../apps/web/src/dashboard/navigation.js';
describe('consolidated dashboard navigation',()=>{
 it('preserves old links without reintroducing duplicate destinations',()=>{
  expect(canonicalView('bots')).toBe('overview');expect(canonicalView('plans')).toBe('tokens');expect(canonicalView('settings')).toBe('setup');expect(canonicalView('policy')).toBe('overview');
  expect(canonicalView(undefined)).toBe('overview');expect(canonicalView('unknown')).toBe('overview');
 });
 it('keeps detail and nested pages under the correct main destination',()=>{
  expect(primaryDestinations).toHaveLength(5);
  for(const view of ['activity','cards','records'])expect(destinationGroup(view)).toBe('activity');
  for(const view of ['wallet','tokens','plans'])expect(destinationGroup(view)).toBe('wallet');
  expect(destinationGroup('crew')).toBe('overview');expect(destinationGroup('deployment')).toBe('setup');expect(destinationGroup('checkout')).toBe('setup');
  for(const view of ['tokens','crew','cards','records','hosted','access','checkout'])expect(canonicalView(view)).toBe(view);
 });
});
