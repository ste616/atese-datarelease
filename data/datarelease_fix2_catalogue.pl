#!/usr/bin/perl

use lib '/n/ste616/usr/share/perl/5.14.2';
use Astro::Coord::ECI;
use Astro::Coord::ECI::Sun;
use Astro::Time;
use JSON;
use strict;

# This script is used to go through an un-fixed catalogue and
# check for alpha5.5 values that were generated from non-C-band data;
# these values will be replaced with null.

# Read in the catalogue.
my $od = "/DATA/KAPUTAR_4/ste616/data_reduction/C2914/datarelease";

# The catalogue of all sources we have.
my $catalogue;
my $catname = $od."/datarelease_catalogue.json";

if (-e $catname) {
    open(C, $catname);
    my $cattxt = <C>;
    close(C);
    $catalogue = from_json $cattxt;
} else {
    $catalogue = {};
}

my @sources = keys %{$catalogue};
for (my $i = 0; $i <= $#sources; $i++) {
    printf "Fixing source %s (%d / %d)\n", $sources[$i], ($i + 1), ($#sources + 1);
    my $c = $catalogue->{$sources[$i]}->{"fluxDensityFit"};
    my $e = $catalogue->{$sources[$i]}->{"epochs"};
    for (my $j = 0; $j <= $#{$c}; $j++) {
	if ($c->[$j]->{"frequencyRange"}->[1] < 4) {
	    print "  epoch ".$e->[$j]." requires fixing...\n";
	    # No C-band data.
	    $c->[$j]->{"alphas5.5"} = JSON::null;
	}
    }
}

my $outcat = $od."/datarelease_catalogue_fixed.json";
open(O, ">".$outcat);
print O to_json $catalogue;
close(O);

