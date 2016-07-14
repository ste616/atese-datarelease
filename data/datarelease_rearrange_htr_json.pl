#!/usr/bin/perl

use JSON;
use strict;

my $htrjsonfile = $ARGV[0];

if (!-e $htrjsonfile) {
    die "Cannot find $htrjsonfile\n";
}

open(J, $htrjsonfile);
chomp(my $htrjsonstring = <J>);
close(J);
my $htrjson = from_json $htrjsonstring;

my $rjson = {};

if (exists $htrjson->{'source'}) {
    $rjson->{$htrjson->{'source'}} = {
	'epochs' => [], 'mjd' => [], 'fluxDensityData' => []
    };

    for (my $i = 0; $i <= $#{$htrjson->{'spectra'}}; $i++) {
	push @{$rjson->{$htrjson->{'source'}}->{'epochs'}}, $htrjson->{'spectra'}->[$i]->{'time'};
	push @{$rjson->{$htrjson->{'source'}}->{'mjd'}}, $htrjson->{'spectra'}->[$i]->{'mjd'};
	push @{$rjson->{$htrjson->{'source'}}->{'fluxDensityData'}}, {
	    'stokes' => "I", 'mode' => "vector", 'data' => []
	};
	for (my $j = 0; $j <= $#{$htrjson->{'spectra'}->[$i]->{'data'}}; $j++) {
	    my $d = $htrjson->{'spectra'}->[$i]->{'data'}->[$j];
	    $d->[0] *= 1.0;
	    $d->[1] *= 1.0;
	    push @{$rjson->{$htrjson->{'source'}}->{'fluxDensityData'}->[
		       $#{$rjson->{$htrjson->{'source'}}->{'fluxDensityData'}}]->{'data'}}, $d;
	}
    }
}

my $ofile = $htrjsonfile;
$ofile =~ s/\.json$/.rearranged.json/;
open(O, ">".$ofile);
print O to_json $rjson;
close(O);
