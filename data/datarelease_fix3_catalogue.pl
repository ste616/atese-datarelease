#!/usr/bin/perl

use lib '/n/ste616/usr/share/perl/5.14.2';
use Astro::Coord::ECI;
use Astro::Coord::ECI::Sun;
use Astro::Time;
use JSON;
use strict;

# This script is used to go through an un-fixed catalogue and
# replace all the closure phase properties with those determined
# at the highest possible frequency.

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
    my $c = $catalogue->{$sources[$i]}->{"closurePhase"};
    my $e = $catalogue->{$sources[$i]}->{"epochs"};
    for (my $j = 0; $j <= $#{$e}; $j++) {
	# Open the epoch file.
	my $fname = $od."/".$e->[$j]."/".$sources[$i]."_".$e->[$j].".averaged128.json";
	open(F, $fname);
	my $jtxt = <F>;
	close(F);
	my $jdata = from_json $jtxt;
	my $cp = $jdata->{"closurePhase"};
	my @srt_cp = sort { $a->{"IF"} <=> $b->{"IF"} } @{$cp};
	$c->[$j] = $srt_cp[$#srt_cp]->{"average_value"};
    }
}

my $outcat = $od."/datarelease_catalogue_fixed.json";
open(O, ">".$outcat);
print O to_json $catalogue;
close(O);


