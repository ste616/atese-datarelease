#!/usr/bin/perl

use JSON;
use PGPLOT;
use Astro::Coord;
use Astro::Time;
use strict;

# Make plots and reports for the data release catalogue.

# 1.
# Open the catalogue.
print "1. Opening catalogue...\n";
my $jsoncatfile = $ARGV[0];
open(J, $jsoncatfile) || die "Cannot open catalogue file $jsoncatfile\n";
chomp(my $catjson = <J>);
close(J);
my $cat = from_json $catjson;

# 2.
print "2. Finding sources with varying positions...\n";
foreach my $src (keys %{$cat}) {
    my $c = $cat->{$src};
    my $ra = $c->{'rightAscension'};
    my $dec = $c->{'declination'};

    my $rasame = &arrhomog($ra);
    my $decsame = &arrhomog($dec);

    if ($rasame == 0 || $decsame == 0) {
	# Check if they are different by enough.
	my $posdiff = &positionsdifferent($ra, $dec);
	if ($posdiff == 1) {
	    print "  ".$src." has varying position.\n";
	}
    }
}


sub arrhomog {
    my $aref = shift;

    # Check that the array has only one unique element.
    for (my $i = 1; $i <= $#{$aref}; $i++) {
	if ($aref->[$i] ne $aref->[0]) {
	    return 0;
	}
    }

    return 1;
}

sub positionsdifferent {
    my $ra_ref = shift;
    my $dec_ref = shift;

    # Check for maximum differences between positions.
    my $maxd = 0;
    for (my $i = 1; $i <= $#{$ra_ref}; $i++) {
	if (($ra_ref->[$i] ne $ra_ref->[0]) ||
	    ($dec_ref->[$i] ne $dec_ref->[0])) {
	    my $d = &posdiff($ra_ref->[0], $dec_ref->[0],
			     $ra_ref->[$i], $dec_ref->[$i]);
	    if ($d > $maxd) {
		$maxd = $d;
	    }
	}
    }
    
    # Positions are different if they vary by more than 1 arcsecond.
    if ($maxd >= deg2turn(1 / 3600)) {
	return 1;
    } else {
	return 0;
    }
}

sub posdiff {
    my $pos1_ra = shift;
    my $pos1_dec = shift;
    my $pos2_ra = shift;
    my $pos2_dec = shift;

    # Turn the positions into polar coordinates.
    my $pos1_ra_turn = str2turn($pos1_ra, "H");
    my $pos1_dec_turn = str2turn($pos1_dec, "D");
    my $pos2_ra_turn = str2turn($pos2_ra, "H");
    my $pos2_dec_turn = str2turn($pos2_dec, "D");

    my @pos1_r = pol2r($pos1_ra_turn, $pos1_dec_turn);
    my @pos2_r = pol2r($pos2_ra_turn, $pos2_dec_turn);

    my $d = sqrt(($pos1_r[0] - $pos2_r[0])**2 +
		 ($pos1_r[1] - $pos2_r[1])**2 +
		 ($pos1_r[2] - $pos2_r[2])**2);

    return $d;
}
